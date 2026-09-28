import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Employee, EmployeeStatus, EmployeeType, ListQuery } from '../../../core/models';
import { EmployeeTypeService } from '../../../core/services/employee-type.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { initials } from '../../../core/utils/format.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe } from '../../../shared/pipes/display.pipes';
import { EMPLOYEE_STATUS_OPTIONS } from '../employee.shared';
import { EmployeeFormComponent } from './employee-form.component';

@Component({
  selector: 'app-employee-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    IstDatePipe,
    EmployeeFormComponent,
  ],
  templateUrl: './employee-list.component.html',
  styles: `
    .emp-thumb {
      border-radius: 50%;
    }
  `,
})
export class EmployeeListComponent extends ListPageBase<Employee> {
  private readonly employees = inject(EmployeeService);
  private readonly employeeTypes = inject(EmployeeTypeService);
  private readonly router = inject(Router);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<Employee | null>(null);

  protected readonly types = signal<EmployeeType[]>([]);
  protected readonly typeFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<EmployeeStatus | null>(null);
  protected readonly statusOptions = EMPLOYEE_STATUS_OPTIONS;
  protected readonly initials = initials;

  constructor() {
    super();
    this.employeeTypes.list({ limit: 1000, sort: 'name' }).subscribe({ next: (res) => this.types.set(res.data) });
  }

  protected fetch(query: ListQuery) {
    return this.employees.list(query);
  }

  protected override filters(): ListQuery {
    return { employeeTypeId: this.typeFilter(), status: this.statusFilter() };
  }

  protected setTypeFilter(value: string | null): void {
    this.typeFilter.set(value ?? null);
    this.applyFilters();
  }

  protected setStatusFilter(value: EmployeeStatus | null): void {
    this.statusFilter.set(value ?? null);
    this.applyFilters();
  }

  protected openProfile(emp: Employee): void {
    void this.router.navigate(['/employee/details', emp.id]);
  }

  protected openForm(emp: Employee | null = null): void {
    const open = (e: Employee | null) => {
      this.editing.set(e);
      this.formVisible.set(true);
    };
    // List rows have Aadhaar / bank account masked — edit the full record.
    if (emp) this.employees.get(emp.id).subscribe({ next: open });
    else open(null);
  }

  protected remove(emp: Employee): void {
    void this.confirmAndDelete(`employee "${emp.fullName}" (${emp.empCode})`, () => this.employees.remove(emp.id));
  }
}
