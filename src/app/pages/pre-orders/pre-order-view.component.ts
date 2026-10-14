import { Component, computed, inject, input, model, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { PreOrder } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PAYMENT_MODE_LABEL } from '../../core/utils/constants';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe, QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { DELIVERY_TYPE_LABEL, isOpen, isOverdue } from './pre-order.shared';

/** Read-only pre-order: customer, delivery, items (Actual vs Item Price), payments — with the next actions. */
@Component({
  selector: 'app-pre-order-view',
  imports: [
    RouterLink,
    ButtonModule,
    MessageModule,
    TagModule,
    FormDialogComponent,
    StatusTagComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
    QtyPipe,
  ],
  templateUrl: './pre-order-view.component.html',
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './pre-order.scss'],
})
export class PreOrderViewComponent {
  readonly visible = model(false);
  readonly order = input<PreOrder | null>(null);

  readonly edit = output<PreOrder>();
  readonly pay = output<PreOrder>();
  readonly ready = output<PreOrder>();
  readonly deliver = output<PreOrder>();
  readonly cancel = output<PreOrder>();

  protected readonly auth = inject(AuthService);
  protected readonly typeLabel = DELIVERY_TYPE_LABEL;
  protected readonly modeLabel: Record<string, string> = PAYMENT_MODE_LABEL;

  protected readonly open = computed(() => {
    const o = this.order();
    return !!o && isOpen(o);
  });
  protected readonly overdue = computed(() => {
    const o = this.order();
    return !!o && isOverdue(o);
  });
  protected readonly kept = computed(() => {
    const o = this.order();
    return o ? o.paidAmount - (o.refundAmount ?? 0) : 0;
  });

  protected emit(action: 'edit' | 'pay' | 'ready' | 'deliver' | 'cancel'): void {
    const o = this.order();
    if (!o) return;
    this[action].emit(o);
  }
}
