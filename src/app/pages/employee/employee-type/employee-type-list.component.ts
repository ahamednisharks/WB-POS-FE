import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { EmployeeType, ListQuery } from '../../../core/models';
import { EmployeeTypeService } from '../../../core/services/employee-type.service';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { EmployeeTypeFormComponent } from './employee-type-form.component';

@Component({
  selector: 'app-employee-type-list',
  imports: [
    TableModule,
    ButtonModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    EmployeeTypeFormComponent,
  ],
  templateUrl: './employee-type-list.component.html',
})
export class EmployeeTypeListComponent extends ListPageBase<EmployeeType> {
  private readonly types = inject(EmployeeTypeService);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<EmployeeType | null>(null);

  protected fetch(query: ListQuery) {
    return this.types.list(query);
  }

  protected openForm(type: EmployeeType | null = null): void {
    this.editing.set(type);
    this.formVisible.set(true);
  }

  protected remove(type: EmployeeType): void {
    void this.confirmAndDelete(`employee type "${type.name}"`, () => this.types.remove(type.id));
  }
}
