import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { tap } from 'rxjs';
import {
  ListQuery,
  Option,
  PurchaseEntry,
  PurchaseOrder,
  PurchasePaymentStatus,
  Supplier,
} from '../../../core/models';
import { PrintService } from '../../../core/services/print.service';
import { PurchaseEntryService } from '../../../core/services/purchase-entry.service';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { DatePreset, DateRange, istDate, presetRange, todayIST } from '../../../core/utils/date.util';
import { round2 } from '../../../core/utils/tax.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { PeFormComponent } from './pe-form.component';
import { PePaymentComponent } from './pe-payment.component';
import { PeViewComponent } from './pe-view.component';

const PAYMENT_STATUS_OPTIONS: Option<PurchasePaymentStatus>[] = [
  { label: 'Unpaid', value: 'UNPAID' },
  { label: 'Partly Paid', value: 'PARTLY_PAID' },
  { label: 'Paid', value: 'PAID' },
];

interface PeSums {
  count: number;
  grandTotal: number;
  paid: number;
  balance: number;
}

@Component({
  selector: 'app-pe-list',
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
    InrCurrencyPipe,
    IstDatePipe,
    PeFormComponent,
    PeViewComponent,
    PePaymentComponent,
  ],
  templateUrl: './pe-list.component.html',
})
export class PurchaseEntryListComponent extends ListPageBase<PurchaseEntry> implements OnInit {
  private readonly entries = inject(PurchaseEntryService);
  private readonly orders = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly printer = inject(PrintService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly paymentStatusOptions = PAYMENT_STATUS_OPTIONS;
  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly today = todayIST();

  // Filters
  protected readonly preset = signal<DatePreset>('MONTH');
  protected readonly range = signal<DateRange>(presetRange('MONTH'));
  protected readonly supplierId = signal<string | null>(null);
  protected readonly paymentStatus = signal<PurchasePaymentStatus | null>(null);

  /** Footer totals over ALL entries matching the filters (not just the current page). */
  protected readonly sums = signal<PeSums | null>(null);

  // Dialogs
  protected readonly formVisible = signal(false);
  protected readonly editing = signal<PurchaseEntry | null>(null);
  protected readonly fromPo = signal<PurchaseOrder | null>(null);
  protected readonly viewVisible = signal(false);
  protected readonly viewing = signal<PurchaseEntry | null>(null);
  protected readonly payVisible = signal(false);
  protected readonly paying = signal<PurchaseEntry | null>(null);

  ngOnInit(): void {
    this.supplierService.listActive().subscribe({
      next: (res) => this.suppliers.set(res.data),
      error: () => this.suppliers.set([]),
    });
    const fromPoId = this.route.snapshot.queryParamMap.get('fromPo');
    if (fromPoId) this.openFromPo(fromPoId);
  }

  /** The API returns the footer totals (over every matching entry) with each page. */
  protected fetch(query: ListQuery) {
    return this.entries.list(query).pipe(
      tap({
        next: (res) =>
          this.sums.set({
            count: res.total,
            grandTotal: round2(res.totals?.grandTotal ?? 0),
            paid: round2(res.totals?.paidAmount ?? 0),
            balance: round2(res.totals?.balance ?? 0),
          }),
        error: () => this.sums.set(null),
      }),
    );
  }

  protected override filters(): ListQuery {
    const r = this.range();
    return { from: r.from, to: r.to, supplierId: this.supplierId(), paymentStatus: this.paymentStatus() };
  }

  /** Reload the page and the footer totals (after save / payment / delete). */
  protected refresh(): void {
    this.load();
  }

  /** List rows carry no items / payments — load the full entry before showing it. */
  private withDetails(pe: PurchaseEntry, open: (full: PurchaseEntry) => void): void {
    this.entries.get(pe.id).subscribe({
      next: open,
      error: () => undefined, // the HTTP error interceptor already shows the message
    });
  }

  protected onSupplierFilter(id: string | null): void {
    this.supplierId.set(id);
    this.applyFilters();
  }

  protected onPaymentStatusFilter(status: PurchasePaymentStatus | null): void {
    this.paymentStatus.set(status);
    this.applyFilters();
  }

  /** Entries can only be edited / deleted on the day they were created (IST). */
  protected sameDay(pe: PurchaseEntry): boolean {
    return istDate(pe.createdAt) === this.today;
  }

  protected isOverdue(pe: PurchaseEntry): boolean {
    return pe.balance > 0 && !!pe.dueDate && pe.dueDate < this.today;
  }

  /** "Convert to PE" from the PO screen: open the form pre-filled from that PO, then drop the query param. */
  private openFromPo(poId: string): void {
    const clearParam = () =>
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    this.orders.get(poId).subscribe({
      next: (po) => {
        clearParam();
        if (po.status !== 'SENT' && po.status !== 'PARTIAL') {
          this.notify.warn(`${po.poNo} is not open for receiving (status: ${po.status.toLowerCase()})`);
          return;
        }
        this.editing.set(null);
        this.fromPo.set(po);
        this.formVisible.set(true);
      },
      error: () => clearParam(),
    });
  }

  protected openForm(pe: PurchaseEntry | null = null): void {
    const open = (entry: PurchaseEntry | null) => {
      this.fromPo.set(null);
      this.editing.set(entry);
      this.formVisible.set(true);
    };
    if (pe) this.withDetails(pe, open);
    else open(null);
  }

  protected view(pe: PurchaseEntry): void {
    this.withDetails(pe, (full) => {
      this.viewing.set(full);
      this.viewVisible.set(true);
    });
  }

  protected print(pe: PurchaseEntry): void {
    this.withDetails(pe, (full) => this.printer.print({ kind: 'purchase-entry', pe: full }));
  }

  protected openPayment(pe: PurchaseEntry): void {
    this.paying.set(pe);
    this.payVisible.set(true);
  }

  protected onSaved(pe: PurchaseEntry): void {
    if (this.viewing()?.id === pe.id) this.viewing.set(pe);
    this.refresh();
  }

  protected onPaid(pe: PurchaseEntry): void {
    if (this.viewing()?.id === pe.id) this.viewing.set(pe);
    this.refresh();
  }

  protected async remove(pe: PurchaseEntry): Promise<void> {
    const ok = await this.confirm.ask({
      header: 'Delete purchase entry',
      message:
        `Delete ${pe.peNo} (invoice ${pe.invoiceNo})? The received stock will be taken out again` +
        (pe.poNo ? ` and ${pe.poNo} will show these items as pending.` : '.'),
      acceptLabel: 'Delete',
      icon: 'pi pi-trash',
      danger: true,
    });
    if (!ok) return;
    this.entries.remove(pe.id).subscribe({
      next: (res) => {
        this.notify.success(res.message, 'Deleted');
        this.refresh();
      },
      error: () => undefined, // the HTTP error interceptor already shows the message
    });
  }
}
