import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { catchError, finalize, map, of, switchMap } from 'rxjs';
import {
  BankPaymentMode,
  Employee,
  Option,
  SalaryPayment,
  SalaryPaymentSave,
  SalaryPaymentStatus,
  SalarySetup,
} from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { NotifyService } from '../../../core/services/notify.service';
import { SalaryPaymentService } from '../../../core/services/salary-payment.service';
import { SalarySetupService } from '../../../core/services/salary-setup.service';
import { BANK_PAYMENT_MODE_OPTIONS } from '../../../core/utils/constants';
import { dateToStr, endOfMonth, monthToStr, strToDate, strToMonth, todayIST } from '../../../core/utils/date.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { round2 } from '../../../core/utils/tax.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { EnumLabelPipe, IstDatePipe, MonthLabelPipe } from '../../../shared/pipes/display.pipes';
import { notFutureDate, PAYMENT_STATUS_OPTIONS, workingDaysIn } from '../employee.shared';

/** Days present must not exceed working days. Error key: `exceeds`. */
function presentWithinWorking(c: AbstractControl): ValidationErrors | null {
  const present = c.value as number | null;
  const working = c.parent?.get('workingDays')?.value as number | null | undefined;
  return present != null && working != null && present > working ? { exceeds: true } : null;
}

@Component({
  selector: 'app-salary-payment-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    SelectModule,
    SelectButtonModule,
    InputNumberModule,
    InputTextModule,
    DatePickerModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
    IstDatePipe,
    MonthLabelPipe,
    EnumLabelPipe,
  ],
  templateUrl: './salary-payment-form.component.html',
  styles: `
    .net-box {
      gap: 0.5rem;
      flex-wrap: wrap;
      background: var(--brand-softer);
      border-color: #ffe98a;
    }
  `,
})
export class SalaryPaymentFormComponent {
  readonly visible = model(false);
  readonly payment = input<SalaryPayment | null>(null);
  /** yyyy-MM to pre-fill when adding (the month currently filtered in the list). */
  readonly defaultMonth = input<string | null>(null);
  readonly saved = output<SalaryPayment>();

  private readonly fb = inject(FormBuilder);
  private readonly payments = inject(SalaryPaymentService);
  private readonly setupsApi = inject(SalarySetupService);
  private readonly employees = inject(EmployeeService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly employeesLoading = signal(false);
  protected readonly setupsLoading = signal(false);
  private readonly activeEmployees = signal<Employee[]>([]);
  /** Salary setups of the selected employee, newest effectiveFrom first. */
  private readonly empSetups = signal<SalarySetup[]>([]);

  protected readonly modeOptions = BANK_PAYMENT_MODE_OPTIONS;
  protected readonly statusOptions = PAYMENT_STATUS_OPTIONS;
  protected readonly today = new Date();

  protected readonly form = this.fb.nonNullable.group({
    month: [null as Date | null, Validators.required],
    employeeId: ['', Validators.required],
    workingDays: [26 as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
    daysPresent: [null as number | null, [Validators.required, Validators.min(0), presentWithinWorking]],
    bonus: [0 as number | null, Validators.min(0)],
    advanceDeduction: [0 as number | null, Validators.min(0)],
    otherDeductions: [0 as number | null, Validators.min(0)],
    deductionReason: ['', Validators.maxLength(120)],
    paymentDate: [null as Date | null, notFutureDate],
    paymentMode: [null as BankPaymentMode | null],
    status: ['PENDING' as SalaryPaymentStatus, Validators.required],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** ACTIVE employees, plus the (possibly resigned) employee of the record being edited. */
  protected readonly employeeOptions = computed<Option[]>(() => {
    const opts = this.activeEmployees().map((e) => ({ label: `${e.empCode} · ${e.fullName}`, value: e.id }));
    const p = this.payment();
    if (p && !opts.some((o) => o.value === p.employeeId)) {
      opts.unshift({ label: `${p.empCode} · ${p.employeeName}`, value: p.employeeId });
    }
    return opts;
  });

  protected readonly monthStr = computed(() => monthToStr(this.value().month ?? null));

  /** Latest setup effective on or before the end of the selected month. */
  protected readonly activeSetup = computed<SalarySetup | null>(() => {
    const month = this.monthStr();
    if (!month) return null;
    const end = endOfMonth(month);
    return this.empSetups().find((s) => s.effectiveFrom <= end) ?? null;
  });

  /** True while editing and employee/month are unchanged — then a missing setup keeps the saved gross. */
  private readonly sameAsSaved = computed(() => {
    const p = this.payment();
    const v = this.value();
    return !!p && v.employeeId === p.employeeId && this.monthStr() === p.month;
  });

  protected readonly gross = computed(() => {
    const v = this.value();
    const setup = this.activeSetup();
    const working = v.workingDays ?? 0;
    const present = Math.min(v.daysPresent ?? 0, working);
    if (!setup) return this.sameAsSaved() ? (this.payment()?.gross ?? 0) : 0;
    if (setup.salaryType === 'MONTHLY') {
      return working > 0 ? round2(((setup.basicSalary + setup.allowances) * present) / working) : 0;
    }
    return round2(setup.basicSalary * present + setup.allowances);
  });

  protected readonly deductions = computed(() => {
    const v = this.value();
    return round2((v.advanceDeduction ?? 0) + (v.otherDeductions ?? 0));
  });

  protected readonly net = computed(() => round2(this.gross() + (this.value().bonus ?? 0) - this.deductions()));

  protected readonly paid = computed(() => this.value().status === 'PAID');

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const p = this.payment();
      const month = p?.month ?? this.defaultMonth() ?? todayIST().slice(0, 7);
      untracked(() => {
        this.loadEmployees();
        this.form.reset({
          month: strToMonth(month),
          employeeId: p?.employeeId ?? '',
          workingDays: p?.workingDays ?? workingDaysIn(month),
          daysPresent: p?.daysPresent ?? null,
          bonus: p?.bonus ?? 0,
          advanceDeduction: p?.advanceDeduction ?? 0,
          otherDeductions: p?.otherDeductions ?? 0,
          deductionReason: p?.deductionReason ?? '',
          paymentDate: strToDate(p?.paymentDate),
          paymentMode: p?.paymentMode ?? null,
          status: p?.status ?? 'PENDING',
        });
      });
    });

    const c = this.form.controls;

    // Selected employee → load their salary setups (for the gross calculation).
    c.employeeId.valueChanges
      .pipe(
        switchMap((id) => {
          if (!id) return of<SalarySetup[]>([]);
          this.setupsLoading.set(true);
          return this.setupsApi.list({ employeeId: id, limit: 50, sort: '-effectiveFrom' }).pipe(
            map((r) => r.data),
            catchError(() => of<SalarySetup[]>([])),
            finalize(() => this.setupsLoading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.empSetups.set(list));

    // Changing employee clears a "salary for this month already exists" error on Month.
    c.employeeId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (c.month.hasError('server')) c.month.updateValueAndValidity({ emitEvent: false });
    });

    // New record: working days follow the month until the user edits them.
    c.month.valueChanges.pipe(takeUntilDestroyed()).subscribe((m) => {
      const month = monthToStr(m);
      if (month && !this.payment() && c.workingDays.pristine) {
        c.workingDays.setValue(workingDaysIn(month));
      }
    });

    c.workingDays.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => c.daysPresent.updateValueAndValidity());

    // Reason is required when there are other deductions.
    c.otherDeductions.valueChanges.pipe(takeUntilDestroyed()).subscribe((amount) => {
      c.deductionReason.setValidators(
        (amount ?? 0) > 0 ? [Validators.required, Validators.maxLength(120)] : [Validators.maxLength(120)],
      );
      c.deductionReason.updateValueAndValidity({ emitEvent: false });
    });

    // Paid → payment date & mode required (date defaults to today).
    c.status.valueChanges.pipe(takeUntilDestroyed()).subscribe((status) => {
      const isPaid = status === 'PAID';
      if (isPaid && !c.paymentDate.value) c.paymentDate.setValue(new Date());
      c.paymentDate.setValidators(isPaid ? [Validators.required, notFutureDate] : [notFutureDate]);
      c.paymentMode.setValidators(isPaid ? [Validators.required] : []);
      c.paymentDate.updateValueAndValidity({ emitEvent: false });
      c.paymentMode.updateValueAndValidity({ emitEvent: false });
    });
  }

  private loadEmployees(): void {
    this.employeesLoading.set(true);
    this.employees.listActive({ sort: 'fullName' }).subscribe({
      next: (res) => {
        this.activeEmployees.set(res.data);
        this.employeesLoading.set(false);
      },
      error: () => this.employeesLoading.set(false),
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving() || this.setupsLoading() || this.net() < 0) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const other = v.otherDeductions ?? 0;
    const body: SalaryPaymentSave = {
      month: monthToStr(v.month) ?? '',
      employeeId: v.employeeId,
      workingDays: v.workingDays ?? 0,
      daysPresent: v.daysPresent ?? 0,
      gross: this.gross(),
      bonus: v.bonus ?? 0,
      advanceDeduction: v.advanceDeduction ?? 0,
      otherDeductions: other,
      deductionReason: other > 0 ? v.deductionReason.trim() : '',
      net: this.net(),
      paymentDate: dateToStr(v.paymentDate),
      paymentMode: v.paymentMode,
      status: v.status,
    };
    const existing = this.payment();
    this.saving.set(true);
    (existing ? this.payments.update(existing.id, body) : this.payments.create(body)).subscribe({
      next: (payment) => {
        this.saving.set(false);
        this.notify.success(`Salary for "${payment.employeeName}" ${existing ? 'updated' : 'saved'}`);
        this.saved.emit(payment);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
