import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ListQuery, Option, PoStatus, PurchaseOrder, Supplier } from '../../../core/models';
import { PrintService } from '../../../core/services/print.service';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { ShareService } from '../../../core/services/share.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { DatePreset, DateRange, presetRange } from '../../../core/utils/date.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { PoCancelComponent } from './po-cancel.component';
import { PoFormComponent } from './po-form.component';
import { PoViewComponent } from './po-view.component';

const PO_STATUS_OPTIONS: Option<PoStatus>[] = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Partially Received', value: 'PARTIAL' },
  { label: 'Received', value: 'RECEIVED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

@Component({
  selector: 'app-po-list',
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
    PoFormComponent,
    PoViewComponent,
    PoCancelComponent,
  ],
  templateUrl: './po-list.component.html',
})
export class PurchaseOrderListComponent extends ListPageBase<PurchaseOrder> implements OnInit {
  private readonly orders = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly printer = inject(PrintService);
  private readonly sharer = inject(ShareService);
  private readonly router = inject(Router);

  protected readonly statusOptions = PO_STATUS_OPTIONS;
  protected readonly suppliers = signal<Supplier[]>([]);

  // Filters
  protected readonly preset = signal<DatePreset>('MONTH');
  protected readonly range = signal<DateRange>(presetRange('MONTH'));
  protected readonly supplierId = signal<string | null>(null);
  protected readonly status = signal<PoStatus | null>(null);

  // Dialogs
  protected readonly formVisible = signal(false);
  protected readonly editing = signal<PurchaseOrder | null>(null);
  protected readonly viewVisible = signal(false);
  protected readonly viewing = signal<PurchaseOrder | null>(null);
  protected readonly cancelVisible = signal(false);
  protected readonly cancelling = signal<PurchaseOrder | null>(null);

  ngOnInit(): void {
    this.supplierService.listActive().subscribe({
      next: (res) => this.suppliers.set(res.data),
      error: () => this.suppliers.set([]),
    });
  }

  protected fetch(query: ListQuery) {
    return this.orders.list(query);
  }

  protected override filters(): ListQuery {
    const r = this.range();
    return { from: r.from, to: r.to, supplierId: this.supplierId(), status: this.status() };
  }

  protected onSupplierFilter(id: string | null): void {
    this.supplierId.set(id);
    this.applyFilters();
  }

  protected onStatusFilter(status: PoStatus | null): void {
    this.status.set(status);
    this.applyFilters();
  }

  protected canEdit(po: PurchaseOrder): boolean {
    return po.status === 'DRAFT';
  }

  protected canConvert(po: PurchaseOrder): boolean {
    return po.status === 'SENT' || po.status === 'PARTIAL';
  }

  protected canCancel(po: PurchaseOrder): boolean {
    // Partially received orders cannot be cancelled (the API rejects it).
    return po.status === 'DRAFT' || po.status === 'SENT';
  }

  protected itemNames(po: PurchaseOrder): string {
    return po.items.map((i) => i.itemName).join(', ');
  }

  protected openForm(po: PurchaseOrder | null = null): void {
    this.editing.set(po);
    this.formVisible.set(true);
  }

  protected view(po: PurchaseOrder): void {
    this.viewing.set(po);
    this.viewVisible.set(true);
  }

  protected print(po: PurchaseOrder): void {
    this.printer.print({ kind: 'purchase-order', po });
  }

  protected share(po: PurchaseOrder): void {
    this.sharer.sharePurchaseOrder(po);
  }

  protected convert(po: PurchaseOrder): void {
    void this.router.navigate(['/transactions/purchase-entries'], { queryParams: { fromPo: po.id } });
  }

  protected openCancel(po: PurchaseOrder): void {
    this.cancelling.set(po);
    this.cancelVisible.set(true);
  }

  protected onCancelled(po: PurchaseOrder): void {
    if (this.viewing()?.id === po.id) this.viewing.set(po);
    this.load();
  }

  protected remove(po: PurchaseOrder): void {
    void this.confirmAndDelete(`draft purchase order ${po.poNo}`, () => this.orders.remove(po.id));
  }
}
