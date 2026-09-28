import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, forkJoin, map, of, Subscription, switchMap } from 'rxjs';
import { Employee, EmployeeType, LoginAccount, SalaryPayment, SalarySetup } from '../../../core/models';
import { EmployeeTypeService } from '../../../core/services/employee-type.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { LoginAccountService } from '../../../core/services/login-account.service';
import { PrintService } from '../../../core/services/print.service';
import { SalaryPaymentService } from '../../../core/services/salary-payment.service';
import { SalarySetupService } from '../../../core/services/salary-setup.service';
import { ageInYears, todayIST } from '../../../core/utils/date.util';
import { initials } from '../../../core/utils/format.util';
import { apiErrorMessage } from '../../../core/utils/http-error.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import {
  AadhaarMaskPipe,
  EnumLabelPipe,
  IstDatePipe,
  IstDateTimePipe,
  MonthLabelPipe,
} from '../../../shared/pipes/display.pipes';
import { EmployeeFormComponent } from './employee-form.component';

@Component({
  selector: 'app-employee-profile',
  imports: [
    RouterLink,
    ButtonModule,
    TabsModule,
    TableModule,
    TagModule,
    SkeletonModule,
    TooltipModule,
    StatusTagComponent,
    EmptyStateComponent,
    EmployeeFormComponent,
    InrCurrencyPipe,
    IstDatePipe,
    IstDateTimePipe,
    MonthLabelPipe,
    AadhaarMaskPipe,
    EnumLabelPipe,
  ],
  templateUrl: './employee-profile.component.html',
  styleUrl: './employee-profile.component.scss',
})
export class EmployeeProfileComponent {
  /** Route param `/employee/details/:id` (bound by withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly employees = inject(EmployeeService);
  private readonly employeeTypes = inject(EmployeeTypeService);
  private readonly salarySetups = inject(SalarySetupService);
  private readonly salaryPayments = inject(SalaryPaymentService);
  private readonly logins = inject(LoginAccountService);
  private readonly printer = inject(PrintService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly employee = signal<Employee | null>(null);
  protected readonly employeeType = signal<EmployeeType | null>(null);
  protected readonly setups = signal<SalarySetup[]>([]);
  protected readonly payments = signal<SalaryPayment[]>([]);
  protected readonly login = signal<LoginAccount | null>(null);
  protected readonly formVisible = signal(false);
  protected readonly tab = signal<string | number | undefined>('details');

  protected readonly initials = initials;

  protected readonly age = computed(() => {
    const dob = this.employee()?.dob;
    return dob ? ageInYears(dob) : null;
  });

  /** The setup in force today: latest effectiveFrom that is not in the future. */
  protected readonly currentSetupId = computed(() => {
    const today = todayIST();
    return this.setups().find((s) => s.effectiveFrom <= today)?.id ?? null;
  });

  private sub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected load(id: string = this.id()): void {
    this.sub?.unsubscribe();
    // Different employee → show the skeleton; same employee (after edit) → refresh in place.
    if (this.employee()?.id !== id) {
      this.employee.set(null);
      this.tab.set('details');
    }
    this.loading.set(true);
    this.error.set(null);
    this.sub = this.employees
      .get(id)
      .pipe(
        switchMap((emp) =>
          forkJoin({
            type: this.employeeTypes.get(emp.employeeTypeId).pipe(catchError(() => of(null))),
            setups: this.salarySetups.list({ employeeId: id, limit: 50, sort: '-effectiveFrom' }).pipe(
              map((r) => r.data),
              catchError(() => of<SalarySetup[]>([])),
            ),
            payments: this.salaryPayments.list({ employeeId: id, limit: 24, sort: '-month' }).pipe(
              map((r) => r.data),
              catchError(() => of<SalaryPayment[]>([])),
            ),
            login: this.logins.list({ employeeId: id, limit: 1 }).pipe(
              map((r) => r.data[0] ?? null),
              catchError(() => of(null)),
            ),
          }).pipe(map((related) => ({ emp, ...related }))),
        ),
      )
      .subscribe({
        next: ({ emp, type, setups, payments, login }) => {
          this.employee.set(emp);
          this.employeeType.set(type);
          this.setups.set(setups);
          this.payments.set(payments);
          this.login.set(login);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.employee.set(null);
          this.error.set(apiErrorMessage(err));
          this.loading.set(false);
        },
      });
  }

  protected back(): void {
    void this.router.navigate(['/employee/details']);
  }

  protected goTo(path: string): void {
    void this.router.navigate([path]);
  }

  protected printSlip(payment: SalaryPayment): void {
    this.printer.print({ kind: 'salary-slip', payment });
  }
}
