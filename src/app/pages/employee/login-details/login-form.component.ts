import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { forkJoin } from 'rxjs';
import { Employee, LoginAccount, LoginAccountCreate, LoginAccountUpdate, LoginStatus, Option, Role } from '../../../core/models';
import { EmployeeTypeService } from '../../../core/services/employee-type.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { LoginAccountService } from '../../../core/services/login-account.service';
import { NotifyService } from '../../../core/services/notify.service';
import { PATTERNS } from '../../../core/utils/constants';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { IstDateTimePipe } from '../../../shared/pipes/display.pipes';
import { LOGIN_STATUS_OPTIONS, passwordsMatch, ROLE_OPTIONS } from '../employee.shared';

/**
 * Create: employee (eligible only) + username + password/confirm + role + status.
 * Edit: username, role, status (password is changed with Reset Password).
 */
@Component({
  selector: 'app-login-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    SelectButtonModule,
    FieldErrorComponent,
    FormDialogComponent,
    IstDateTimePipe,
  ],
  templateUrl: './login-form.component.html',
})
export class LoginFormComponent {
  readonly visible = model(false);
  readonly login = input<LoginAccount | null>(null);
  readonly saved = output<LoginAccount>();

  private readonly fb = inject(FormBuilder);
  private readonly logins = inject(LoginAccountService);
  private readonly employees = inject(EmployeeService);
  private readonly employeeTypes = inject(EmployeeTypeService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly optionsLoading = signal(false);
  private readonly eligible = signal<Employee[]>([]);

  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly statusOptions = LOGIN_STATUS_OPTIONS;
  protected readonly isEdit = computed(() => this.login() !== null);

  protected readonly employeeOptions = computed<Option[]>(() =>
    this.eligible().map((e) => ({ label: `${e.empCode} · ${e.fullName} (${e.employeeTypeName})`, value: e.id })),
  );

  protected readonly form = this.fb.nonNullable.group(
    {
      employeeId: ['', Validators.required],
      username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(PATTERNS.username)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      role: ['CASHIER' as Role, Validators.required],
      status: ['ACTIVE' as LoginStatus, Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const l = this.login();
      untracked(() => {
        this.form.reset({
          employeeId: l?.employeeId ?? '',
          username: l?.username ?? '',
          password: '',
          confirmPassword: '',
          role: l?.role ?? 'CASHIER',
          status: l?.status ?? 'ACTIVE',
        });
        const c = this.form.controls;
        if (l) {
          c.employeeId.disable();
          c.password.disable();
          c.confirmPassword.disable();
        } else {
          c.employeeId.enable();
          c.password.enable();
          c.confirmPassword.enable();
          this.loadEligibleEmployees();
        }
      });
    });
  }

  /** ACTIVE employees whose type can log in and who don't have a login yet. */
  private loadEligibleEmployees(): void {
    this.optionsLoading.set(true);
    forkJoin({
      employees: this.employees.listActive({ sort: 'fullName' }),
      types: this.employeeTypes.list({ limit: 1000 }),
      logins: this.logins.list({ limit: 1000 }),
    }).subscribe({
      next: ({ employees, types, logins }) => {
        const loginTypes = new Set(types.data.filter((t) => t.canLogin).map((t) => t.id));
        const hasLogin = new Set(logins.data.map((l) => l.employeeId));
        this.eligible.set(employees.data.filter((e) => loginTypes.has(e.employeeTypeId) && !hasLogin.has(e.id)));
        this.optionsLoading.set(false);
      },
      error: () => this.optionsLoading.set(false),
    });
  }

  protected get mismatch(): boolean {
    const confirm = this.form.controls.confirmPassword;
    return this.form.hasError('mismatch') && (confirm.touched || confirm.dirty) && !confirm.errors;
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const existing = this.login();
    this.saving.set(true);
    const request = existing
      ? this.logins.update(existing.id, { username: v.username.trim(), role: v.role, status: v.status } satisfies LoginAccountUpdate)
      : this.logins.create({
          employeeId: v.employeeId,
          username: v.username.trim(),
          password: v.password,
          role: v.role,
          status: v.status,
        } satisfies LoginAccountCreate);
    request.subscribe({
      next: (account) => {
        this.saving.set(false);
        this.notify.success(`Login "${account.username}" ${existing ? 'updated' : 'created'} for ${account.employeeName}`);
        this.saved.emit(account);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
