import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, Subject, tap } from 'rxjs';
import { ListQuery, SalaryPayment, SalaryPaymentStatus } from '../../../core/models';
import { PrintService } from '../../../core/services/print.service';
import { SalaryPaymentService } from '../../../core/services/salary-payment.service';
import { BANK_PAYMENT_MODE_LABEL } from '../../../core/utils/constants';
import { monthLabel, monthToStr, strToMonth, todayIST } from '../../../core/utils/date.util';
import { formatINR } from '../../../core/utils/format.util';
import { round2 } from '../../../core/utils/tax.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { IstDatePipe, MonthLabelPipe } from '../../../shared/pipes/display.pipes';
import { PAYMENT_STATUS_OPTIONS } from '../employee.shared';
import { SalaryMarkPaidDialogComponent } from './salary-mark-paid-dialog.component';
import { SalaryPaymentFormComponent } from './salary-payment-form.component';

interface MonthTotals {
  count: number;
  gross: number;
  deductions: number;
  net: number;
}

@Component({
  selector: 'app-salary-payment-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    TooltipModule,
    SelectModule,
    DatePickerModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    EmptyStateComponent,
    SkeletonRowComponent,
    StatusTagComponent,
    InrCurrencyPipe,
    IstDatePipe,
    MonthLabelPipe,
    SalaryPaymentFormComponent,
    SalaryMarkPaidDialogComponent,
  ],
  templateUrl: './salary-payment-list.component.html',
  styleUrl: './salary-tab.scss',
})
export class SalaryPaymentListComponent extends ListPageBase<SalaryPayment> {
  private readonly payments = inject(SalaryPaymentService);
  private readonly printer = inject(PrintService);

  protected readonly monthFilter = signal<Date | null>(strToMonth(todayIST().slice(0, 7)));
  protected readonly statusFilter = signal<SalaryPaymentStatus | null>(null);
  protected readonly statusOptions = PAYMENT_STATUS_OPTIONS;
  protected readonly modeLabel: Record<string, string> = BANK_PAYMENT_MODE_LABEL;
  protected readonly month = computed(() => monthToStr(this.monthFilter()));

  /** Totals over ALL records matching the month/status filters (the API returns them with each page). */
  protected readonly totals = signal<MonthTotals | null>(null);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<SalaryPayment | null>(null);
  protected readonly payVisible = signal(false);
  protected readonly paying = signal<SalaryPayment | null>(null);

  protected readonly search$ = new Subject<string>();

  constructor() {
    super();
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => this.onSearch(term.trim()));
  }

  protected fetch(query: ListQuery) {
    return this.payments.list(query).pipe(
      tap({
        next: ({ totals: t, total }) =>
          this.totals.set({
            count: t?.records ?? total,
            gross: round2(t?.gross ?? 0),
            deductions: round2((t?.advanceDeduction ?? 0) + (t?.otherDeductions ?? 0)),
            net: round2(t?.net ?? 0),
          }),
        error: () => this.totals.set(null),
      }),
    );
  }

  protected override filters(): ListQuery {
    return { month: this.month(), status: this.statusFilter() };
  }

  /** Reload list + totals (after save / mark paid / delete). */
  protected refresh(): void {
    this.load();
  }

  protected setMonth(value: Date | null): void {
    this.monthFilter.set(value ?? null);
    this.applyFilters();
  }

  protected setStatus(value: SalaryPaymentStatus | null): void {
    this.statusFilter.set(value ?? null);
    this.applyFilters();
  }

  protected deductionsOf(p: SalaryPayment): number {
    return round2(p.advanceDeduction + p.otherDeductions);
  }

  /** "Advance ₹500.00 · Other ₹200.00 (Uniform)" */
  protected deductionTip(p: SalaryPayment): string {
    const parts: string[] = [];
    if (p.advanceDeduction > 0) parts.push(`Advance ${formatINR(p.advanceDeduction)}`);
    if (p.otherDeductions > 0) {
      parts.push(`Other ${formatINR(p.otherDeductions)}${p.deductionReason ? ` (${p.deductionReason})` : ''}`);
    }
    return parts.join(' · ');
  }

  protected openForm(payment: SalaryPayment | null = null): void {
    this.editing.set(payment);
    this.formVisible.set(true);
  }

  protected markPaid(payment: SalaryPayment): void {
    this.paying.set(payment);
    this.payVisible.set(true);
  }

  protected printSlip(payment: SalaryPayment): void {
    this.printer.print({ kind: 'salary-slip', payment });
  }

  protected remove(payment: SalaryPayment): void {
    void this.confirmAndDelete(`salary record of "${payment.employeeName}" for ${monthLabel(payment.month)}`, () =>
      this.payments.remove(payment.id),
    );
  }
}
