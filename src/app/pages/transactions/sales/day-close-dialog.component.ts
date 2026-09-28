import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { merge, Subscription } from 'rxjs';
import { DayCloseRequest, TransactionSummary } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { NotifyService } from '../../../core/services/notify.service';
import { PrintService } from '../../../core/services/print.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { displayDate, todayIST } from '../../../core/utils/date.util';
import { apiErrorMessage, applyServerError } from '../../../core/utils/http-error.util';
import { round2 } from '../../../core/utils/tax.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { IstDatePipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

/** Required, and not just whitespace (the backend trims remarks). */
function requiredText(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

/**
 * Cash tally at the end of the day: opening + cash sales − cash refunds − cash-outs = expected,
 * compared with the counted cash. Saves the day close and prints the 80mm slip.
 */
@Component({
  selector: 'app-day-close-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    TextareaModule,
    MessageModule,
    SkeletonModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
    IstDatePipe,
  ],
  templateUrl: './day-close-dialog.component.html',
  styleUrl: './day-close-dialog.component.scss',
})
export class DayCloseDialogComponent {
  readonly visible = model(false);

  private readonly fb = inject(FormBuilder);
  private readonly transactions = inject(TransactionService);
  private readonly notify = inject(NotifyService);
  private readonly printer = inject(PrintService);
  protected readonly isAdmin = inject(AuthService).isAdmin;

  protected readonly date = signal(todayIST());
  protected readonly summary = signal<TransactionSummary | null>(null);
  protected readonly loadingSummary = signal(false);
  protected readonly summaryError = signal<string | null>(null);
  protected readonly saving = signal(false);
  private summarySub?: Subscription;

  protected readonly form = this.fb.nonNullable.group({
    openingCash: [0 as number | null, [Validators.min(0)]],
    countedCash: [null as number | null, [Validators.required, Validators.min(0)]],
    remarks: ['', [Validators.maxLength(250)]],
  });

  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** opening + cash sales − cash refunds − cash-outs */
  protected readonly expected = computed<number | null>(() => {
    const s = this.summary();
    if (!s) return null;
    return round2((this.value().openingCash ?? 0) + s.cash - s.cashRefunds - s.cashOuts);
  });

  /** counted − expected (null until counted cash is entered) */
  protected readonly difference = computed<number | null>(() => {
    const expected = this.expected();
    const counted = this.value().countedCash;
    if (expected === null || counted === null || counted === undefined) return null;
    return round2(counted - expected);
  });

  protected readonly remarksRequired = computed(() => {
    const d = this.difference();
    return d !== null && d !== 0;
  });

  constructor() {
    // Reset the form and reload today's figures every time the dialog opens.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => this.open());
    });

    // Remarks become mandatory while counted cash differs from expected.
    merge(this.form.controls.openingCash.valueChanges, this.form.controls.countedCash.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.syncRemarksRule());

    inject(DestroyRef).onDestroy(() => this.summarySub?.unsubscribe());
  }

  protected loadSummary(): void {
    this.summarySub?.unsubscribe();
    this.loadingSummary.set(true);
    this.summaryError.set(null);
    const today = this.date();
    this.summarySub = this.transactions.list({ from: today, to: today, limit: 1 }).subscribe({
      next: (res) => {
        this.summary.set(res.summary);
        this.loadingSummary.set(false);
        this.syncRemarksRule();
      },
      error: (err: unknown) => {
        this.summary.set(null);
        this.summaryError.set(apiErrorMessage(err));
        this.loadingSummary.set(false);
      },
    });
  }

  protected save(): void {
    const s = this.summary();
    if (!s || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const openingCash = round2(v.openingCash ?? 0);
    const countedCash = round2(v.countedCash ?? 0);
    const expectedCash = round2(openingCash + s.cash - s.cashRefunds - s.cashOuts);
    const body: DayCloseRequest = {
      date: this.date(),
      openingCash,
      cashSales: s.cash,
      cashRefunds: s.cashRefunds,
      cashOuts: s.cashOuts,
      expectedCash,
      countedCash,
      difference: round2(countedCash - expectedCash),
      remarks: v.remarks.trim(),
    };
    this.saving.set(true);
    this.transactions.dayClose(body).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.notify.success(
          `Day closed for ${displayDate(result.date)}. Printing the slip…`,
          'Day closed',
        );
        this.printer.print({ kind: 'day-close', dayClose: result });
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }

  private open(): void {
    this.date.set(todayIST());
    this.summary.set(null);
    this.form.reset({ openingCash: 0, countedCash: null, remarks: '' });
    this.syncRemarksRule();
    this.loadSummary();
  }

  private syncRemarksRule(): void {
    const s = this.summary();
    const v = this.form.getRawValue();
    const needed =
      !!s &&
      v.countedCash !== null &&
      round2(v.countedCash - ((v.openingCash ?? 0) + s.cash - s.cashRefunds - s.cashOuts)) !== 0;
    const remarks = this.form.controls.remarks;
    if (needed === remarks.hasValidator(requiredText)) return;
    if (needed) remarks.addValidators(requiredText);
    else remarks.removeValidators(requiredText);
    remarks.updateValueAndValidity();
  }
}
