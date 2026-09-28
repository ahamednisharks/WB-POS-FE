import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { firstValueFrom, tap } from 'rxjs';
import {
  Option,
  PaymentMode,
  Transaction,
  TransactionSummary,
  TxnType,
} from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ExportColumn, ExportService } from '../../../core/services/export.service';
import { LoginAccountService } from '../../../core/services/login-account.service';
import { TransactionQuery, TransactionService } from '../../../core/services/transaction.service';
import { PAYMENT_MODE_LABEL, PAYMENT_MODE_OPTIONS } from '../../../core/utils/constants';
import {
  DatePreset,
  DateRange,
  displayDate,
  displayDateTime,
  presetRange,
  todayIST,
} from '../../../core/utils/date.util';
import { formatAmount, formatINR } from '../../../core/utils/format.util';
import { round2 } from '../../../core/utils/tax.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { DayCloseDialogComponent } from './day-close-dialog.component';

const TXN_TYPE_LABEL: Record<TxnType, string> = {
  PAYMENT: 'Payment',
  REFUND: 'Refund',
  CASH_OUT: 'Cash-out',
};

/** Largest page the transactions API returns (sp_transaction_list clamps the limit). */
const EXPORT_PAGE_SIZE = 1000;

const TXN_TYPE_OPTIONS: Option<TxnType>[] = [
  { label: 'Payment', value: 'PAYMENT' },
  { label: 'Refund', value: 'REFUND' },
  { label: 'Cash-out', value: 'CASH_OUT' },
];

interface SummaryCard {
  label: string;
  icon: string;
  tone: 'brand' | 'cash' | 'upi' | 'card' | 'refund' | 'net';
  value: number;
  sub: string;
  /** Money going out of the till: shown with a leading minus. */
  outflow?: boolean;
  /** Shown in red. */
  danger?: boolean;
}

/** Money leaving the till (refunds, cash-outs) is shown as a negative amount. */
function signedAmount(t: Transaction): number {
  return t.type === 'PAYMENT' ? t.amount : -t.amount;
}

@Component({
  selector: 'app-sales-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TooltipModule,
    SelectModule,
    SkeletonModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    DateRangeFilterComponent,
    DayCloseDialogComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
  ],
  templateUrl: './sales-list.component.html',
  styleUrl: './sales-list.component.scss',
})
export class SalesListComponent extends ListPageBase<Transaction> {
  private readonly transactions = inject(TransactionService);
  private readonly logins = inject(LoginAccountService);
  private readonly exporter = inject(ExportService);
  private readonly auth = inject(AuthService);

  protected override sort = '-txnDate';

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly today = todayIST();

  // ---- filters
  protected readonly preset = signal<DatePreset>('TODAY');
  protected readonly range = signal<DateRange>(presetRange('TODAY'));
  protected readonly mode = signal<PaymentMode | null>(null);
  protected readonly type = signal<TxnType | null>(null);
  protected readonly cashierId = signal<string | null>(null);
  protected readonly cashierOptions = signal<Option[]>([]);
  protected readonly modeOptions = PAYMENT_MODE_OPTIONS;
  protected readonly typeOptions = TXN_TYPE_OPTIONS;

  protected readonly hasFilters = computed(
    () => !!(this.mode() || this.type() || this.cashierId()),
  );

  // ---- summary + actions
  protected readonly summary = signal<TransactionSummary | null>(null);
  protected readonly exporting = signal<'excel' | 'pdf' | null>(null);
  protected readonly dayCloseVisible = signal(false);

  protected readonly cards = computed<SummaryCard[]>(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      {
        label: 'Total Received',
        icon: 'pi pi-wallet',
        tone: 'brand',
        value: s.totalReceived,
        sub: 'All payments',
      },
      {
        label: 'Cash',
        icon: 'pi pi-money-bill',
        tone: 'cash',
        value: s.cash,
        sub: 'Cash payments',
      },
      { label: 'UPI', icon: 'pi pi-qrcode', tone: 'upi', value: s.upi, sub: 'UPI payments' },
      {
        label: 'Card',
        icon: 'pi pi-credit-card',
        tone: 'card',
        value: s.card,
        sub: 'Card payments',
      },
      {
        label: 'Refunds',
        icon: 'pi pi-replay',
        tone: 'refund',
        value: s.refunds,
        sub: `Cash refunds ${formatINR(s.cashRefunds)}`,
        outflow: s.refunds > 0,
        danger: s.refunds > 0,
      },
      {
        label: 'Net',
        icon: 'pi pi-chart-line',
        tone: 'net',
        value: s.net,
        sub:
          s.cashOuts > 0
            ? `After refunds & cash-outs (${formatINR(s.cashOuts)})`
            : 'After refunds & cash-outs',
        danger: s.net < 0,
      },
    ];
  });

  protected readonly summarySkeleton = [0, 1, 2, 3, 4, 5];

  constructor() {
    super();
    if (this.isAdmin()) this.loadCashiers();
  }

  protected fetch(query: TransactionQuery) {
    return this.transactions.list(query).pipe(
      tap({
        next: (res) => this.summary.set(res.summary),
        error: () => this.summary.set(null),
      }),
    );
  }

  protected override filters(): TransactionQuery {
    // Cashiers always see their own transactions for today (the backend enforces it too).
    const admin = this.isAdmin();
    const r = admin ? this.range() : { from: this.today, to: this.today };
    return {
      from: r.from,
      to: r.to,
      mode: this.mode() ?? undefined,
      type: this.type() ?? undefined,
      cashierId: admin ? (this.cashierId() ?? undefined) : undefined,
    };
  }

  protected clearFilters(): void {
    this.mode.set(null);
    this.type.set(null);
    this.cashierId.set(null);
    this.applyFilters();
  }

  protected modeText(mode: PaymentMode): string {
    return PAYMENT_MODE_LABEL[mode] ?? mode;
  }

  // ------------------------------------------------------------------ export
  protected async export(kind: 'excel' | 'pdf'): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(kind);
    try {
      // The API returns at most 1000 rows per page, so collect every page.
      const query: TransactionQuery = {
        ...this.filters(),
        limit: EXPORT_PAGE_SIZE,
        search: this.searchTerm || undefined,
        sort: this.sort,
      };
      const res = await firstValueFrom(this.transactions.list({ ...query, page: 1 }));
      for (let page = 2; res.data.length < res.total; page++) {
        const next = await firstValueFrom(this.transactions.list({ ...query, page }));
        if (next.data.length === 0) break;
        res.data.push(...next.data);
      }
      if (res.data.length === 0) {
        this.notify.info('There are no transactions to export for the selected filters.');
        return;
      }
      const f = this.filters();
      const period =
        f.from === f.to ? displayDate(f.from) : `${displayDate(f.from)} to ${displayDate(f.to)}`;
      const fileName = `sales-transactions_${f.from}${f.from === f.to ? '' : `_to_${f.to}`}`;
      if (kind === 'excel') {
        await this.exporter.toExcel(fileName, 'Transactions', this.exportColumns(false), res.data);
      } else {
        const s = res.summary;
        const subtitle =
          `Period: ${period}${this.filterText()} · ${res.data.length} transactions · ` +
          `Received Rs ${formatAmount(s.totalReceived)} · Refunds Rs ${formatAmount(s.refunds)} · ` +
          `Cash-outs Rs ${formatAmount(s.cashOuts)} · Net Rs ${formatAmount(s.net)}`;
        await this.exporter.toPdf(
          fileName,
          'Sales Transactions',
          subtitle,
          this.exportColumns(true),
          res.data,
        );
      }
      this.notify.success(`${kind === 'excel' ? 'Excel' : 'PDF'} file downloaded`, 'Exported');
    } catch (err: unknown) {
      // HTTP errors are already toasted by the interceptor.
      if (!(err instanceof HttpErrorResponse))
        this.notify.error('Could not create the export file. Please try again.');
    } finally {
      this.exporting.set(null);
    }
  }

  private exportColumns(pdf: boolean): ExportColumn<Transaction>[] {
    return [
      { header: 'Txn ID', value: (t) => t.txnNo, width: 14 },
      { header: 'Date / Time', value: (t) => displayDateTime(t.txnDate), width: 20 },
      { header: 'Bill No', value: (t) => t.billNo ?? '-', width: 12 },
      { header: 'Type', value: (t) => TXN_TYPE_LABEL[t.type], width: 10 },
      { header: 'Mode', value: (t) => PAYMENT_MODE_LABEL[t.mode], width: 8 },
      pdf
        ? { header: 'Amount (Rs)', value: (t) => formatAmount(signedAmount(t)), align: 'right' }
        : {
            header: 'Amount (₹)',
            value: (t) => round2(signedAmount(t)),
            width: 12,
            align: 'right',
          },
      { header: 'Reference', value: (t) => t.reference || t.note || '', width: 28 },
      { header: 'Cashier', value: (t) => t.cashierName, width: 18 },
    ];
  }

  private filterText(): string {
    const parts: string[] = [];
    const m = this.mode();
    const t = this.type();
    if (m) parts.push(`Mode: ${PAYMENT_MODE_LABEL[m]}`);
    if (t) parts.push(`Type: ${TXN_TYPE_LABEL[t]}`);
    const c = this.cashierId();
    if (c) parts.push(`Cashier: ${this.cashierOptions().find((o) => o.value === c)?.label ?? c}`);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }

  private loadCashiers(): void {
    this.logins.list({ limit: 100, sort: 'employeeName' }).subscribe({
      next: (res) =>
        this.cashierOptions.set(
          res.data.map((l) => ({
            label: `${l.employeeName} (${l.role === 'ADMIN' ? 'Admin' : 'Cashier'})`,
            value: l.id,
          })),
        ),
    });
  }
}
