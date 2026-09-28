import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Category, ListQuery } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { initials } from '../../../core/utils/format.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { CategoryFormComponent } from './category-form.component';

@Component({
  selector: 'app-category-list',
  imports: [
    TableModule,
    ButtonModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    CategoryFormComponent,
  ],
  templateUrl: './category-list.component.html',
})
export class CategoryListComponent extends ListPageBase<Category> {
  private readonly categories = inject(CategoryService);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<Category | null>(null);
  protected readonly initials = initials;

  protected fetch(query: ListQuery) {
    return this.categories.list(query);
  }

  protected openForm(category: Category | null = null): void {
    this.editing.set(category);
    this.formVisible.set(true);
  }

  protected remove(category: Category): void {
    void this.confirmAndDelete(`category "${category.name}"`, () => this.categories.remove(category.id));
  }
}
