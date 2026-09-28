import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { toSignal } from '@angular/core/rxjs-interop';
import { Bill } from '../../core/models';
import { BillService } from '../../core/services/bill.service';
import { NotifyService } from '../../core/services/notify.service';
import { BILL_CANCEL_REASONS } from '../../core/utils/constants';
import { applyServerError } from '../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';

/** ADMIN: cancel a completed bill with a reason (payments are refunded). */
@Component({
  selector: 'app-cancel-bill-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    MessageModule,
    SelectModule,
    TextareaModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
  ],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Cancel ' + (bill()?.billNo ?? 'bill')" width="480px">
      @if (bill(); as b) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid" novalidate>
          <div class="span-all">
            <p-message severity="warn" icon="pi pi-exclamation-triangle">
              {{ b.grandTotal | inr }} will be recorded as a refund ({{ b.payments.length > 1 ? 'split' : (b.paymentMode ?? '').toLowerCase() }}). This cannot be undone.
            </p-message>
          </div>
          <div class="field span-all">
            <label for="cancel-reason">Reason <span class="req">*</span></label>
            <p-select
              inputId="cancel-reason"
              [options]="reasons"
              formControlName="reason"
              placeholder="Select a reason"
            />
            <app-field-error [control]="form.controls.reason" label="Reason" />
          </div>
          @if (isOther()) {
            <div class="field span-all">
              <label for="cancel-note">Details <span class="req">*</span></label>
              <textarea pTextarea id="cancel-note" rows="3" formControlName="note" maxlength="200" placeholder="Describe the reason"></textarea>
              <app-field-error [control]="form.controls.note" label="Details" />
            </div>
          }
          <button type="submit" hidden aria-hidden="true"></button>
        </form>
      }
      <div dialogFooter class="dialog-footer">
        <p-button label="Keep bill" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Cancel bill"
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
export class CancelBillDialogComponent {
  readonly visible = model(false);
  readonly bill = input<Bill | null>(null);
  readonly cancelled = output<Bill>();

  private readonly fb = inject(FormBuilder);
  private readonly bills = inject(BillService);
  private readonly notify = inject(NotifyService);

  protected readonly reasons = BILL_CANCEL_REASONS;
  protected readonly saving = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    reason: ['', Validators.required],
    note: ['', Validators.maxLength(200)],
  });
  private readonly reasonValue = toSignal(this.form.controls.reason.valueChanges, { initialValue: '' });
  protected readonly isOther = computed(() => this.reasonValue() === 'Other');

  constructor() {
    effect(() => {
      if (this.visible()) this.form.reset({ reason: '', note: '' });
    });
    effect(() => {
      const note = this.form.controls.note;
      note.setValidators(this.isOther() ? [Validators.required, Validators.maxLength(200)] : [Validators.maxLength(200)]);
      note.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected submit(): void {
    const b = this.bill();
    if (!b || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { reason, note } = this.form.getRawValue();
    this.saving.set(true);
    // The note goes as `remarks` so reason + note together can use the full 200 characters.
    this.bills.cancel(b.id, reason, note.trim()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.notify.success(`${updated.billNo} cancelled and refund recorded`, 'Bill cancelled');
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
