import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { PaymentMode, PreOrder, PreOrderSummary } from '../../core/models';
import { NotifyService } from '../../core/services/notify.service';
import { PreOrderService } from '../../core/services/pre-order.service';
import { PAYMENT_MODE_OPTIONS } from '../../core/utils/constants';
import { formatINR } from '../../core/utils/format.util';
import { applyServerError } from '../../core/utils/http-error.util';
import { round2 } from '../../core/utils/tax.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { PRE_ORDER_CANCEL_REASONS } from './pre-order.shared';

/** ADMIN: cancel a booked / ready pre-order and decide how much of the amount paid goes back (all, part or none). */
@Component({
  selector: 'app-pre-order-cancel-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TextareaModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
  ],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Cancel ' + (order()?.orderNo ?? 'pre-order')" width="520px">
      @if (order(); as o) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid" novalidate>
          <div class="span-all">
            <p-message severity="warn" icon="pi pi-exclamation-triangle">
              {{ o.customerName }} has paid {{ o.paidAmount | inr }}. Cancelling cannot be undone.
            </p-message>
          </div>

          <div class="field span-all">
            <label for="pc-reason">Reason <span class="req">*</span></label>
            <p-select inputId="pc-reason" [options]="reasons" formControlName="reason" placeholder="Select a reason" />
            <app-field-error [control]="form.controls.reason" label="Reason" />
          </div>
          <div class="field span-all">
            <label for="pc-note">Details @if (isOther()) {<span class="req">*</span>}</label>
            <textarea pTextarea id="pc-note" rows="2" formControlName="note" maxlength="150" placeholder="Optional"></textarea>
            <app-field-error [control]="form.controls.note" label="Details" />
          </div>

          @if (o.paidAmount > 0) {
            <div class="field">
              <label for="pc-refund">Refund to customer <span class="req">*</span></label>
              <p-inputnumber
                inputId="pc-refund"
                formControlName="refundAmount"
                mode="currency"
                currency="INR"
                locale="en-IN"
                [min]="0"
                [max]="o.paidAmount"
                inputStyleClass="w-full"
              />
              <div class="quick-links">
                <button type="button" class="link-btn" (click)="setRefund(o.paidAmount)">Refund all</button>
                <button type="button" class="link-btn" (click)="setRefund(0)">No refund</button>
              </div>
              <app-field-error [control]="form.controls.refundAmount" label="Refund" />
              @if (refundTooHigh()) {
                <small class="error-text" role="alert">Cannot be more than the {{ o.paidAmount | inr }} paid</small>
              }
            </div>
            @if (refund() > 0) {
              <div class="field">
                <label id="pc-mode-label">Refund mode</label>
                <p-selectbutton
                  [options]="modes"
                  optionLabel="label"
                  optionValue="value"
                  formControlName="refundMode"
                  [allowEmpty]="false"
                  ariaLabelledBy="pc-mode-label"
                />
              </div>
              @if (value().refundMode !== 'CASH') {
                <div class="field span-all">
                  <label for="pc-ref">Reference / UTR</label>
                  <input pInputText id="pc-ref" formControlName="reference" maxlength="50" placeholder="Optional" />
                </div>
              }
            }
            <div class="span-all kv">
              <span>Refund {{ refund() | inr }}</span>
              <span class="bold">Shop keeps {{ kept() | inr }}</span>
            </div>
          }
          <button type="submit" hidden aria-hidden="true"></button>
        </form>
      }
      <div dialogFooter class="dialog-footer">
        <p-button label="Keep order" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Cancel order"
          icon="pi pi-ban"
          severity="danger"
          [loading]="saving()"
          [disabled]="form.invalid || refundTooHigh() || saving()"
          (onClick)="submit()"
        />
      </div>
    </app-form-dialog>
  `,
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './pre-order.scss'],
})
export class PreOrderCancelDialogComponent {
  readonly visible = model(false);
  readonly order = input<PreOrderSummary | null>(null);
  readonly cancelled = output<PreOrder>();

  private readonly fb = inject(FormBuilder);
  private readonly preOrders = inject(PreOrderService);
  private readonly notify = inject(NotifyService);

  protected readonly reasons = PRE_ORDER_CANCEL_REASONS;
  protected readonly modes = PAYMENT_MODE_OPTIONS;
  protected readonly saving = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    reason: ['', Validators.required],
    note: ['', Validators.maxLength(150)],
    refundAmount: [0 as number | null, [Validators.required, Validators.min(0)]],
    refundMode: ['CASH' as PaymentMode],
    reference: ['', Validators.maxLength(50)],
  });
  protected readonly value = signal(this.form.getRawValue());
  private readonly reasonValue = toSignal(this.form.controls.reason.valueChanges, { initialValue: '' });

  protected readonly isOther = computed(() => this.reasonValue() === 'Other');
  protected readonly refund = computed(() => this.value().refundAmount ?? 0);
  protected readonly kept = computed(() => round2((this.order()?.paidAmount ?? 0) - this.refund()));
  protected readonly refundTooHigh = computed(() => this.refund() > (this.order()?.paidAmount ?? 0));

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    // Default: give everything back; the admin lowers it when the shop keeps part of the advance.
    effect(() => {
      if (!this.visible()) return;
      const paid = this.order()?.paidAmount ?? 0;
      untracked(() => {
        this.saving.set(false);
        this.form.reset({ reason: '', note: '', refundAmount: paid, refundMode: 'CASH', reference: '' });
      });
    });
    effect(() => {
      const note = this.form.controls.note;
      note.setValidators(this.isOther() ? [Validators.required, Validators.maxLength(150)] : [Validators.maxLength(150)]);
      note.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected setRefund(amount: number): void {
    this.form.controls.refundAmount.setValue(amount);
  }

  protected submit(): void {
    const order = this.order();
    if (!order || this.form.invalid || this.refundTooHigh() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const note = v.note.trim();
    const reason = v.reason === 'Other' ? note : note ? `${v.reason} - ${note}` : v.reason;
    const refund = v.refundAmount ?? 0;
    this.saving.set(true);
    this.preOrders
      .cancel(order.id, {
        reason,
        refundAmount: refund,
        refundMode: refund > 0 ? v.refundMode : null,
        referenceNo: refund > 0 && v.refundMode !== 'CASH' ? v.reference.trim() || null : null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.notify.success(
            refund > 0 ? `${updated.orderNo} cancelled — ${formatINR(refund)} refunded` : `${updated.orderNo} cancelled`,
            'Pre-order cancelled',
          );
          this.cancelled.emit(updated);
          this.visible.set(false);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          applyServerError(this.form, err);
        },
      });
  }
}
