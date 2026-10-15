import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ListQuery, PreOrder, PreOrderSummary } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PreOrderAlertService } from '../../core/services/pre-order-alert.service';
import { PreOrderService } from '../../core/services/pre-order.service';
import { DateRange, dateToStr } from '../../core/utils/date.util';
import { ListPageBase } from '../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { PreOrderCancelDialogComponent } from './pre-order-cancel-dialog.component';
import { PreOrderFormComponent } from './pre-order-form.component';
import { PreOrderPayDialogComponent } from './pre-order-pay-dialog.component';
import {
  DELIVERY_PRESET_OPTIONS,
  DELIVERY_TYPE_LABEL,
  DeliveryPreset,
  deliveryRange,
  isDueToday,
  isOpen,
  isOverdue,
  PRE_ORDER_STATUS_OPTIONS,
  PreOrderStatusFilter,
} from './pre-order.shared';
import { PreOrderViewComponent } from './pre-order-view.component';

@Component({
  selector: 'app-pre-order-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TagModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
    PreOrderFormComponent,
    PreOrderViewComponent,
    PreOrderPayDialogComponent,
    PreOrderCancelDialogComponent,
  ],
  templateUrl: './pre-order-list.component.html',
  styles: `
    .items-summary {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      max-width: 18rem;
    }
  `,
})
export class PreOrderListComponent extends ListPageBase<PreOrderSummary> {
  private readonly preOrders = inject(PreOrderService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly deliveryAlerts = inject(PreOrderAlertService);
  protected readonly auth = inject(AuthService);

  protected readonly presetOptions = DELIVERY_PRESET_OPTIONS;
  protected readonly statusOptions = PRE_ORDER_STATUS_OPTIONS;
  protected readonly typeLabel: Record<string, string> = DELIVERY_TYPE_LABEL;

  // Filters: open orders, all dates, soonest delivery first.
  protected readonly preset = signal<DeliveryPreset>('ALL');
  protected readonly customRange = signal<Date[] | null>(null);
  protected readonly status = signal<PreOrderStatusFilter>('OPEN');
  private range: DateRange | null = null;
  /** "Now" for the Overdue / Today tags, refreshed on every load. */
  protected readonly now = signal(Date.now());

  // Dialogs
  protected readonly opening = signal<string | null>(null);
  protected readonly formVisible = signal(false);
  protected readonly editing = signal<PreOrder | null>(null);
  protected readonly viewVisible = signal(false);
  protected readonly viewing = signal<PreOrder | null>(null);
  protected readonly payVisible = signal(false);
  protected readonly payPurpose = signal<'PAY' | 'DELIVER'>('PAY');
  protected readonly paying = signal<PreOrderSummary | null>(null);
  protected readonly cancelVisible = signal(false);
  protected readonly cancelling = signal<PreOrderSummary | null>(null);

  constructor() {
    super();
    this.sort = 'deliveryAt';
    // Links from the delivery alerts: ?view=<id> opens that order, ?delivery=TODAY lists today's open deliveries.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const viewId = params.get('view');
      const delivery = params.get('delivery');
      if (!viewId && !delivery) return;
      if (delivery === 'TODAY') {
        this.status.set('OPEN');
        this.onPreset('TODAY');
      }
      if (viewId) this.view({ id: viewId });
      // Drop the params so the same link works again and a reload does not reopen the order
      // (next tick: this can run while the navigation that opened the screen is still finishing).
      setTimeout(() => void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true }));
    });
  }

  protected fetch(query: ListQuery) {
    return this.preOrders.list(query);
  }

  protected override filters(): ListQuery {
    return { from: this.range?.from, to: this.range?.to, status: this.status() };
  }

  override load(): void {
    this.now.set(Date.now());
    super.load();
  }

  protected onPreset(preset: DeliveryPreset): void {
    this.preset.set(preset);
    if (preset === 'CUSTOM') return;
    this.customRange.set(null);
    this.range = deliveryRange(preset);
    this.applyFilters();
  }

  protected onCustomRange(dates: Date[] | null): void {
    this.customRange.set(dates);
    const from = dateToStr(dates?.[0]);
    const to = dateToStr(dates?.[1] ?? null);
    if (!from || !to) return;
    this.range = { from, to };
    this.applyFilters();
  }

  protected onStatus(status: PreOrderStatusFilter): void {
    this.status.set(status);
    this.applyFilters();
  }

  protected readonly isOpen = isOpen;

  protected overdue(o: PreOrderSummary): boolean {
    return isOverdue(o, this.now());
  }

  protected dueToday(o: PreOrderSummary): boolean {
    return isDueToday(o, this.now());
  }

  /** Loads the full order (lines, payments) before opening a dialog that needs it. */
  private withFull(row: Pick<PreOrderSummary, 'id'>, then: (o: PreOrder) => void): void {
    this.opening.set(row.id);
    this.preOrders.get(row.id).subscribe({
      next: (o) => {
        this.opening.set(null);
        then(o);
      },
      error: () => this.opening.set(null),
    });
  }

  protected openNew(): void {
    this.editing.set(null);
    this.formVisible.set(true);
  }

  protected openEdit(row: PreOrderSummary): void {
    this.withFull(row, (o) => {
      this.viewVisible.set(false);
      this.editing.set(o);
      this.formVisible.set(true);
    });
  }

  protected view(row: Pick<PreOrderSummary, 'id'>): void {
    this.withFull(row, (o) => {
      this.viewing.set(o);
      this.viewVisible.set(true);
    });
  }

  protected openPay(row: PreOrderSummary, purpose: 'PAY' | 'DELIVER'): void {
    this.paying.set(row);
    this.payPurpose.set(purpose);
    this.payVisible.set(true);
  }

  protected openCancel(row: PreOrderSummary): void {
    this.cancelling.set(row);
    this.cancelVisible.set(true);
  }

  protected markReady(row: PreOrderSummary): void {
    this.preOrders.markReady(row.id).subscribe({
      next: (o) => {
        this.notify.success(`${o.orderNo} is ready for ${o.deliveryType === 'HOME' ? 'delivery' : 'pickup'}`, 'Marked ready');
        this.onChanged(o);
      },
    });
  }

  protected openBill(row: PreOrderSummary): void {
    if (row.billId) void this.router.navigate(['/orders', row.billId]);
  }

  /** After any save / payment / delivery / cancel: refresh the list and an open view of the same order. */
  protected onChanged(o: PreOrder): void {
    if (this.viewing()?.id === o.id) this.viewing.set(o);
    this.load();
    // A delivered / cancelled / re-dated order stops (or starts) alerting straight away.
    this.deliveryAlerts.refresh();
  }
}
