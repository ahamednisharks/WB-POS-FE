import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { PurchaseOrder } from '../../../core/models';
import { NotifyService } from '../../../core/services/notify.service';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';

/** Cancel a purchase order — a reason is mandatory. */
@Component({
  selector: 'app-po-cancel',
  imports: [ReactiveFormsModule, ButtonModule, TextareaModule, FieldErrorComponent, FormDialogComponent],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Cancel ' + (po()?.poNo ?? 'Purchase Order')" width="480px">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex gap-2" style="flex-direction: column">
        <p class="muted small" style="margin: 0">
          The purchase order will be marked <strong>Cancelled</strong> and can no longer be received against. This cannot
          be undone.
        </p>
        <div class="field">
          <label for="po-cancel-reason">Reason <span class="req">*</span></label>
          <textarea
            pTextarea
            id="po-cancel-reason"
            formControlName="reason"
            rows="3"
            maxlength="200"
            placeholder="e.g. Supplier cannot deliver on time"
          ></textarea>
          <app-field-error
            [control]="form.controls.reason"
            label="Reason"
            [messages]="{ pattern: 'Reason is required' }"
          />
        </div>
        <button type="submit" hidden aria-hidden="true"></button>
      </form>

      <div dialogFooter class="dialog-footer">
        <p-button label="Keep PO" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Cancel PO"
          icon="pi pi-ban"
          severity="danger"
          [loading]="saving()"
          [disabled]="form.invalid || saving()"
          (onClick)="submit()"
        />
      </div>
    </app-form-dialog>
  `,
})
export class PoCancelComponent {
  readonly visible = model(false);
  readonly po = input<PurchaseOrder | null>(null);
  readonly cancelled = output<PurchaseOrder>();

  private readonly fb = inject(FormBuilder);
  private readonly orders = inject(PurchaseOrderService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]],
  });

  constructor() {
    effect(() => {
      if (this.visible()) this.form.reset({ reason: '' });
    });
  }

  protected submit(): void {
    const po = this.po();
    if (!po || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.orders.cancel(po.id, this.form.getRawValue().reason.trim()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.notify.success(`Purchase order ${updated.poNo} cancelled`);
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
