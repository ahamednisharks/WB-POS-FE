import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Bill, BillPaymentMode, BillStatus, ListQuery, Option } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BillService } from '../../core/services/bill.service';
import { LoginAccountService } from '../../core/services/login-account.service';
import { PrintService } from '../../core/services/print.service';
import { ShareService } from '../../core/services/share.service';
import { PAYMENT_MODE_LABEL } from '../../core/utils/constants';
import { DatePreset, DateRange, presetRange, todayIST } from '../../core/utils/date.util';
import { ListPageBase } from '../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { CancelBillDialogComponent } from './cancel-bill-dialog.component';

@Component({
  selector: 'app-order-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    DateRangeFilterComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    CancelBillDialogComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
  ],
  templateUrl: './order-list.component.html',
})
export class OrderListComponent extends ListPageBase<Bill> implements OnInit {
  private readonly bills = inject(BillService);
  private readonly logins = inject(LoginAccountService);
  private readonly print = inject(PrintService);
  private readonly share = inject(ShareService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  protected readonly modeLabel: Record<string, string> = PAYMENT_MODE_LABEL;
  protected readonly statusOptions: Option<BillStatus | 'ALL'>[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Held', value: 'HELD' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];
  protected readonly modeOptions: Option<BillPaymentMode | 'ALL'>[] = [
    { label: 'All modes', value: 'ALL' },
    { label: 'Cash', value: 'CASH' },
    { label: 'UPI', value: 'UPI' },
    { label: 'Card', value: 'CARD' },
    { label: 'Split', value: 'SPLIT' },
  ];
  protected readonly cashierOptions = signal<Option[]>([]);

  protected readonly preset = signal<DatePreset>('TODAY');
  protected readonly range = signal<DateRange>(presetRange('TODAY'));
  protected status: BillStatus | 'ALL' = 'ALL';
  protected paymentMode: BillPaymentMode | 'ALL' = 'ALL';
  protected cashierId: string | null = null;

  protected readonly cancelOpen = signal(false);
  protected readonly cancelling = signal<Bill | null>(null);

  constructor() {
    super();
    this.sort = '-billDate';
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const status = q.get('status');
    if (status === 'COMPLETED' || status === 'HELD' || status === 'CANCELLED') this.status = status;
    const from = q.get('from');
    const to = q.get('to');
    if (from && to) {
      this.range.set({ from, to });
      this.preset.set(from === to && from === todayIST() ? 'TODAY' : 'CUSTOM');
    }
    if (this.auth.isAdmin()) {
      this.logins.list({ limit: 200, sort: 'username' }).subscribe({
        next: (res) => this.cashierOptions.set(res.data.map((l) => ({ label: l.employeeName, value: l.id }))),
      });
    }
  }

  protected fetch(query: ListQuery) {
    return this.bills.list(query);
  }

  protected override filters(): ListQuery {
    const r = this.range();
    return {
      from: r.from,
      to: r.to,
      status: this.status === 'ALL' ? undefined : this.status,
      paymentMode: this.paymentMode === 'ALL' ? undefined : this.paymentMode,
      cashierId: this.cashierId ?? undefined,
    };
  }

  protected onRange(range: DateRange): void {
    this.range.set(range);
    this.applyFilters();
  }

  protected newBill(): void {
    void this.router.navigate(['/billing']);
  }

  protected view(bill: Bill): void {
    void this.router.navigate(['/orders', bill.id]);
  }

  /** List rows carry no lines / cash details — print and share need the full bill. */
  protected reprint(bill: Bill): void {
    this.bills.get(bill.id).subscribe({ next: (full) => this.print.print({ kind: 'receipt', bill: full, duplicate: true }) });
  }

  protected shareBill(bill: Bill): void {
    this.bills.get(bill.id).subscribe({ next: (full) => this.share.shareBill(full) });
  }

  protected resume(bill: Bill): void {
    void this.router.navigate(['/billing'], { queryParams: { resume: bill.id } });
  }

  protected openCancel(bill: Bill): void {
    this.cancelling.set(bill);
    this.cancelOpen.set(true);
  }
}
