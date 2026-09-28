import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ListQuery, Supplier } from '../../../core/models';
import { SupplierService } from '../../../core/services/supplier.service';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { SupplierFormComponent } from './supplier-form.component';

@Component({
  selector: 'app-supplier-list',
  imports: [
    TableModule,
    ButtonModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    SupplierFormComponent,
  ],
  templateUrl: './supplier-list.component.html',
  styles: `
    .due {
      color: var(--danger);
      font-weight: 600;
    }
  `,
})
export class SupplierListComponent extends ListPageBase<Supplier> {
  private readonly suppliers = inject(SupplierService);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<Supplier | null>(null);

  protected fetch(query: ListQuery) {
    return this.suppliers.list(query);
  }

  protected openForm(supplier: Supplier | null = null): void {
    this.editing.set(supplier);
    this.formVisible.set(true);
  }

  protected remove(supplier: Supplier): void {
    void this.confirmAndDelete(`supplier "${supplier.name}"`, () => this.suppliers.remove(supplier.id));
  }
}
