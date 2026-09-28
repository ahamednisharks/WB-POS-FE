import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { BankPaymentMode, SalaryPayment } from '../../../core/models';
import { NotifyService } from '../../../core/services/notify.service';
import { SalaryPaymentService } from '../../../core/services/salary-payment.service';
import { BANK_PAYMENT_MODE_OPTIONS } from '../../../core/utils/constants';
import { dateToStr } from '../../../core/utils/date.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { MonthLabelPipe } from '../../../shared/pipes/display.pipes';
import { notFutureDate } from '../employee.shared';

/** Small dialog: pick payment date (default today) + mode, then mark a Pending salary as Paid. */
@Component({
  selector: 'app-salary-mark-paid-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    SelectButtonModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
    MonthLabelPipe,
  ],
  template: `
    <app-form-dialog [(visible)]="visible" header="Mark Salary as Paid" width="460px">
      @if (payment(); as p) {
        <div class="info-banner">
          <i class="pi pi-wallet" aria-hidden="true"></i>
          <div>
            <div class="bold">{{ p.employeeName }} <span class="muted small">({{ p.empCode }})</span></div>
            <div class="small">{{ p.month | monthLabel }} · Net salary <span class="bold num">{{ p.net | inr }}</span></div>
          </div>
        </div>
      }
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid mt-2" novalidate>
        <div class="field span-all">
          <label for="mp-date">Payment Date <span class="req">*</span></label>
          <p-datepicker
            inputId="mp-date"
            formControlName="paymentDate"
            dateFormat="dd-mm-yy"
            [showIcon]="true"
            [maxDate]="today"
            placeholder="dd-mm-yyyy"
            appendTo="body"
          />
          <app-field-error
            [control]="form.controls.paymentDate"
            label="Payment date"
            [messages]="{ future: 'Payment date cannot be in the future' }"
          />
        </div>
        <div class="field span-all">
          <label id="mp-mode-label">Payment Mode <span class="req">*</span></label>
          <p-selectbutton
            [options]="modeOptions"
            optionLabel="label"
            optionValue="value"
            formControlName="paymentMode"
            [allowEmpty]="false"
            ariaLabelledBy="mp-mode-label"
          />
          @if (form.controls.paymentMode.value === 'CASH') {
            <small class="hint">Recorded as a cash-out from the counter.</small>
          }
          <app-field-error [control]="form.controls.paymentMode" label="Payment mode" />
        </div>
        <button type="submit" hidden aria-hidden="true"></button>
      </form>

      <div dialogFooter class="dialog-footer">
        <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Mark Paid"
          icon="pi pi-check"
          severity="success"
          [loading]="saving()"
          [disabled]="form.invalid || saving()"
          (onClick)="save()"
        />
      </div>
    </app-form-dialog>
  `,
})
export class SalaryMarkPaidDialogComponent {
  readonly visible = model(false);
  readonly payment = input<SalaryPayment | null>(null);
  readonly saved = output<SalaryPayment>();

  private readonly fb = inject(FormBuilder);
  private readonly payments = inject(SalaryPaymentService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly modeOptions = BANK_PAYMENT_MODE_OPTIONS;
  protected readonly today = new Date();

  protected readonly form = this.fb.nonNullable.group({
    paymentDate: [null as Date | null, [Validators.required, notFutureDate]],
    paymentMode: [null as BankPaymentMode | null, Validators.required],
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const p = this.payment();
      this.form.reset({ paymentDate: new Date(), paymentMode: p?.paymentMode ?? null });
    });
  }

  protected save(): void {
    const p = this.payment();
    if (!p || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (!v.paymentMode) return;
    this.saving.set(true);
    this.payments.markPaid(p, dateToStr(v.paymentDate) ?? '', v.paymentMode).subscribe({
      next: (paid) => {
        this.saving.set(false);
        this.notify.success(`Salary of "${paid.employeeName}" marked as paid`);
        this.saved.emit(paid);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
