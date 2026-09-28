import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { BankPaymentMode, PurchaseEntry } from '../../../core/models';
import { NotifyService } from '../../../core/services/notify.service';
import { PurchaseEntryService } from '../../../core/services/purchase-entry.service';
import { BANK_PAYMENT_MODE_OPTIONS } from '../../../core/utils/constants';
import { dateToStr } from '../../../core/utils/date.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { formatINR } from '../../../core/utils/format.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

/** Records a supplier payment against a purchase entry (amount ≤ balance). */
@Component({
  selector: 'app-pe-payment',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    SelectModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
  ],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Add Payment — ' + (pe()?.peNo ?? '')" width="500px">
      @if (pe(); as entry) {
        <div class="info-banner" style="margin-bottom: 1rem">
          <i class="pi pi-wallet" aria-hidden="true"></i>
          <div class="small">
            <div class="bold">{{ entry.supplierName }} · Invoice {{ entry.invoiceNo }}</div>
            <div>
              Total {{ entry.grandTotal | inr }} · Paid {{ entry.paidAmount | inr }} ·
              <strong>Balance {{ entry.balance | inr }}</strong>
            </div>
          </div>
        </div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid" novalidate>
        <div class="field span-all">
          <label for="pay-amount">Amount ₹ <span class="req">*</span></label>
          <p-inputnumber
            inputId="pay-amount"
            formControlName="amount"
            mode="currency"
            currency="INR"
            locale="en-IN"
            [min]="0"
            [max]="pe()?.balance ?? null"
          />
          <app-field-error
            [control]="form.controls.amount"
            label="Amount"
            [messages]="{ min: 'Amount must be greater than 0', max: 'Amount cannot exceed the balance ' + balanceLabel() }"
          />
        </div>
        <div class="field">
          <label for="pay-mode">Mode <span class="req">*</span></label>
          <p-select
            inputId="pay-mode"
            formControlName="mode"
            [options]="modeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select mode"
          />
          <app-field-error [control]="form.controls.mode" label="Payment mode" />
        </div>
        <div class="field">
          <label for="pay-date">Date <span class="req">*</span></label>
          <p-datepicker
            inputId="pay-date"
            formControlName="date"
            [showIcon]="true"
            [readonlyInput]="true"
            [maxDate]="today"
            dateFormat="dd-mm-yy"
          />
          <app-field-error [control]="form.controls.date" label="Payment date" />
        </div>
        <button type="submit" hidden aria-hidden="true"></button>
      </form>

      <div dialogFooter class="dialog-footer">
        <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Save Payment"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="form.invalid || saving()"
          (onClick)="submit()"
        />
      </div>
    </app-form-dialog>
  `,
})
export class PePaymentComponent {
  readonly visible = model(false);
  readonly pe = input<PurchaseEntry | null>(null);
  readonly paid = output<PurchaseEntry>();

  private readonly fb = inject(FormBuilder);
  private readonly entries = inject(PurchaseEntryService);
  private readonly notify = inject(NotifyService);

  protected readonly today = new Date();
  protected readonly modeOptions = BANK_PAYMENT_MODE_OPTIONS;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    mode: [null as BankPaymentMode | null, Validators.required],
    date: [new Date() as Date | null, Validators.required],
  });

  constructor() {
    // Default amount = full balance, date = today, every time the dialog opens.
    effect(() => {
      if (!this.visible()) return;
      const pe = this.pe();
      untracked(() => {
        const balance = pe?.balance ?? 0;
        this.form.controls.amount.setValidators([Validators.required, Validators.min(0.01), Validators.max(balance)]);
        this.form.reset({ amount: balance > 0 ? balance : null, mode: null, date: new Date() });
      });
    });
  }

  protected balanceLabel(): string {
    return formatINR(this.pe()?.balance ?? 0);
  }

  protected submit(): void {
    const pe = this.pe();
    if (!pe || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (!v.mode || v.amount === null) return;
    this.saving.set(true);
    this.entries.addPayment(pe.id, { amount: v.amount, mode: v.mode, date: dateToStr(v.date) ?? '' }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.notify.success(`Payment of ${formatINR(v.amount)} recorded for ${updated.peNo}`);
        this.paid.emit(updated);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
