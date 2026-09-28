import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { Employee, Option, SalarySetup, SalarySetupSave, SalaryType } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { NotifyService } from '../../../core/services/notify.service';
import { SalarySetupService } from '../../../core/services/salary-setup.service';
import { dateToStr, startOfMonth, strToDate, todayIST } from '../../../core/utils/date.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { SALARY_TYPE_OPTIONS } from '../employee.shared';

@Component({
  selector: 'app-salary-setup-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    SelectModule,
    SelectButtonModule,
    InputNumberModule,
    DatePickerModule,
    FieldErrorComponent,
    FormDialogComponent,
  ],
  templateUrl: './salary-setup-form.component.html',
})
export class SalarySetupFormComponent {
  readonly visible = model(false);
  readonly setup = input<SalarySetup | null>(null);
  readonly saved = output<SalarySetup>();

  private readonly fb = inject(FormBuilder);
  private readonly setups = inject(SalarySetupService);
  private readonly employees = inject(EmployeeService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly employeesLoading = signal(false);
  private readonly activeEmployees = signal<Employee[]>([]);
  protected readonly salaryTypeOptions = SALARY_TYPE_OPTIONS;

  /** ACTIVE employees, plus the (possibly resigned) employee of the record being edited. */
  protected readonly employeeOptions = computed<Option[]>(() => {
    const opts = this.activeEmployees().map((e) => ({ label: `${e.empCode} · ${e.fullName}`, value: e.id }));
    const s = this.setup();
    if (s && !opts.some((o) => o.value === s.employeeId)) {
      opts.unshift({ label: `${s.empCode} · ${s.employeeName}`, value: s.employeeId });
    }
    return opts;
  });

  protected readonly form = this.fb.nonNullable.group({
    employeeId: ['', Validators.required],
    salaryType: ['MONTHLY' as SalaryType, Validators.required],
    basicSalary: [null as number | null, [Validators.required, Validators.min(1)]],
    allowances: [0 as number | null, Validators.min(0)],
    effectiveFrom: [null as Date | null, Validators.required],
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const s = this.setup();
      untracked(() => {
        this.loadEmployees();
        this.form.reset({
          employeeId: s?.employeeId ?? '',
          salaryType: s?.salaryType ?? 'MONTHLY',
          basicSalary: s?.basicSalary ?? null,
          allowances: s?.allowances ?? 0,
          effectiveFrom: strToDate(s?.effectiveFrom ?? startOfMonth(todayIST())),
        });
      });
    });
  }

  protected get isDaily(): boolean {
    return this.form.controls.salaryType.value === 'DAILY';
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
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: SalarySetupSave = {
      employeeId: v.employeeId,
      salaryType: v.salaryType,
      basicSalary: v.basicSalary ?? 0,
      allowances: v.allowances ?? 0,
      effectiveFrom: dateToStr(v.effectiveFrom) ?? '',
    };
    const existing = this.setup();
    this.saving.set(true);
    (existing ? this.setups.update(existing.id, body) : this.setups.create(body)).subscribe({
      next: (setup) => {
        this.saving.set(false);
        this.notify.success(`Salary setup for "${setup.employeeName}" ${existing ? 'updated' : 'saved'}`);
        this.saved.emit(setup);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
