import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import {
  Employee,
  EmployeeSave,
  EmployeeStatus,
  EmployeeType,
  Gender,
  Option,
  UploadedFile,
} from '../../../core/models';
import { EmployeeTypeService } from '../../../core/services/employee-type.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { NotifyService } from '../../../core/services/notify.service';
import { PATTERNS } from '../../../core/utils/constants';
import { dateToStr, strToDate } from '../../../core/utils/date.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FilePickerComponent } from '../../../shared/components/file-picker/file-picker.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { ImagePickerComponent } from '../../../shared/components/image-picker/image-picker.component';
import { AadhaarMaskPipe } from '../../../shared/pipes/display.pipes';
import { EMPLOYEE_STATUS_OPTIONS, GENDER_OPTIONS, minAge, notFutureDate, yearsAgo } from '../employee.shared';

/** Resign date must be on/after the joining date. Error key: `beforeJoining`. */
function resignAfterJoining(c: AbstractControl): ValidationErrors | null {
  const resign = dateToStr(c.value as Date | null);
  const joining = dateToStr(c.parent?.get('joiningDate')?.value as Date | null);
  return resign && joining && resign < joining ? { beforeJoining: true } : null;
}

@Component({
  selector: 'app-employee-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    RadioButtonModule,
    FieldErrorComponent,
    FormDialogComponent,
    ImagePickerComponent,
    FilePickerComponent,
    AadhaarMaskPipe,
  ],
  templateUrl: './employee-form.component.html',
})
export class EmployeeFormComponent {
  readonly visible = model(false);
  readonly employee = input<Employee | null>(null);
  readonly saved = output<Employee>();

  private readonly fb = inject(FormBuilder);
  private readonly employees = inject(EmployeeService);
  private readonly employeeTypes = inject(EmployeeTypeService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly typesLoading = signal(false);
  private readonly types = signal<EmployeeType[]>([]);

  protected readonly genderOptions = GENDER_OPTIONS;
  protected readonly statusOptions = EMPLOYEE_STATUS_OPTIONS;
  protected readonly today = new Date();
  protected readonly dobMax = yearsAgo(18);

  /** Active types, plus the current (possibly inactive) type of the employee being edited. */
  protected readonly typeOptions = computed<Option[]>(() => {
    const opts = this.types().map((t) => ({ label: t.name, value: t.id }));
    const e = this.employee();
    if (e && !opts.some((o) => o.value === e.employeeTypeId)) {
      opts.push({ label: `${e.employeeTypeName} (inactive)`, value: e.employeeTypeId });
    }
    return opts;
  });

  protected readonly form = this.fb.nonNullable.group({
    photo: [null as string | null],
    fullName: ['', [Validators.required, Validators.maxLength(80)]],
    employeeTypeId: ['', Validators.required],
    gender: [null as Gender | null, Validators.required],
    dob: [null as Date | null, minAge(18)],
    mobile: ['', [Validators.required, Validators.pattern(PATTERNS.mobile)]],
    altMobile: ['', Validators.pattern(PATTERNS.mobile)],
    email: ['', [Validators.email, Validators.maxLength(100)]],
    address: ['', [Validators.required, Validators.maxLength(250)]],
    emergencyName: ['', Validators.maxLength(80)],
    emergencyMobile: ['', Validators.pattern(PATTERNS.mobile)],
    aadhaar: ['', Validators.pattern(PATTERNS.aadhaar)],
    idProof: [null as UploadedFile | null],
    bankAccount: ['', Validators.pattern(PATTERNS.bankAccount)],
    ifsc: ['', Validators.pattern(PATTERNS.ifsc)],
    joiningDate: [null as Date | null, [Validators.required, notFutureDate]],
    status: ['ACTIVE' as EmployeeStatus, Validators.required],
    resignDate: [null as Date | null],
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const e = this.employee();
      untracked(() => {
        this.loadTypes();
        this.form.reset({
          photo: e?.photo ?? null,
          fullName: e?.fullName ?? '',
          employeeTypeId: e?.employeeTypeId ?? '',
          gender: e?.gender ?? null,
          dob: strToDate(e?.dob),
          mobile: e?.mobile ?? '',
          altMobile: e?.altMobile ?? '',
          email: e?.email ?? '',
          address: e?.address ?? '',
          emergencyName: e?.emergencyName ?? '',
          emergencyMobile: e?.emergencyMobile ?? '',
          aadhaar: e?.aadhaar ?? '',
          idProof: e?.idProof ?? null,
          bankAccount: e?.bankAccount ?? '',
          ifsc: e?.ifsc ?? '',
          joiningDate: e ? strToDate(e.joiningDate) : new Date(),
          status: e?.status ?? 'ACTIVE',
          resignDate: strToDate(e?.resignDate),
        });
        this.syncResignValidators();
      });
    });

    const c = this.form.controls;
    c.status.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncResignValidators());
    c.joiningDate.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => c.resignDate.updateValueAndValidity());
    // IFSC is always stored upper-case.
    c.ifsc.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      const upper = v.toUpperCase();
      if (upper !== v) c.ifsc.setValue(upper, { emitEvent: false });
    });
  }

  protected get resigned(): boolean {
    return this.form.controls.status.value === 'RESIGNED';
  }

  /** Resign date is required (and ≥ joining date) only while status is Resigned. */
  private syncResignValidators(): void {
    const ctrl = this.form.controls.resignDate;
    if (this.resigned) {
      ctrl.setValidators([Validators.required, notFutureDate, resignAfterJoining]);
    } else {
      ctrl.clearValidators();
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private loadTypes(): void {
    this.typesLoading.set(true);
    this.employeeTypes.listActive().subscribe({
      next: (res) => {
        this.types.set(res.data);
        this.typesLoading.set(false);
      },
      error: () => this.typesLoading.set(false),
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (!v.gender) return;
    const resigned = v.status === 'RESIGNED';
    const body: EmployeeSave = {
      photo: v.photo,
      fullName: v.fullName.trim(),
      employeeTypeId: v.employeeTypeId,
      gender: v.gender,
      dob: dateToStr(v.dob),
      mobile: v.mobile.trim(),
      altMobile: v.altMobile.trim(),
      email: v.email.trim(),
      address: v.address.trim(),
      emergencyName: v.emergencyName.trim(),
      emergencyMobile: v.emergencyMobile.trim(),
      aadhaar: v.aadhaar.trim(),
      idProof: v.idProof,
      bankAccount: v.bankAccount.trim(),
      ifsc: v.ifsc.trim().toUpperCase(),
      joiningDate: dateToStr(v.joiningDate) ?? '',
      status: v.status,
      resignDate: resigned ? dateToStr(v.resignDate) : null,
    };
    const existing = this.employee();
    this.saving.set(true);
    (existing ? this.employees.update(existing.id, body) : this.employees.create(body)).subscribe({
      next: (emp) => {
        this.saving.set(false);
        this.notify.success(`Employee "${emp.fullName}" (${emp.empCode}) ${existing ? 'updated' : 'added'}`);
        this.saved.emit(emp);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
