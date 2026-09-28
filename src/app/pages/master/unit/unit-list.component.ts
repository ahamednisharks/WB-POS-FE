import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ListQuery, Unit } from '../../../core/models';
import { UnitService } from '../../../core/services/unit.service';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { UnitFormComponent } from './unit-form.component';

@Component({
  selector: 'app-unit-list',
  imports: [
    TableModule,
    ButtonModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    UnitFormComponent,
  ],
  templateUrl: './unit-list.component.html',
})
export class UnitListComponent extends ListPageBase<Unit> {
  private readonly units = inject(UnitService);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<Unit | null>(null);

  protected fetch(query: ListQuery) {
    return this.units.list(query);
  }

  protected openForm(unit: Unit | null = null): void {
    this.editing.set(unit);
    this.formVisible.set(true);
  }

  protected remove(unit: Unit): void {
    void this.confirmAndDelete(`unit "${unit.name}"`, () => this.units.remove(unit.id));
  }
}
