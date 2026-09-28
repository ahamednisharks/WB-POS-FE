import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Item, ItemType, ListQuery, Option, Status } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { ItemService } from '../../../core/services/item.service';
import { ITEM_TYPE_LABEL, ITEM_TYPE_OPTIONS, STATUS_OPTIONS } from '../../../core/utils/constants';
import { initials } from '../../../core/utils/format.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { QtyPipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { ItemFormComponent } from './item-form.component';

@Component({
  selector: 'app-item-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    QtyPipe,
    ItemFormComponent,
  ],
  templateUrl: './item-list.component.html',
  styles: `
    .setup-steps {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
      margin-top: 0.35rem;

      .pi {
        font-size: 0.7rem;
        margin: 0;
      }
    }
  `,
})
export class ItemListComponent extends ListPageBase<Item> implements OnInit {
  private readonly items = inject(ItemService);
  private readonly categories = inject(CategoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<Item | null>(null);

  protected readonly initials = initials;
  protected readonly typeOptions = ITEM_TYPE_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly categoryOptions = signal<Option[]>([]);

  // Filters
  protected readonly categoryId = signal<string | null>(null);
  protected readonly type = signal<ItemType | null>(null);
  protected readonly status = signal<Status | null>(null);
  private readonly searching = signal(false);

  protected readonly hasFilters = computed(
    () => this.searching() || !!this.categoryId() || !!this.type() || !!this.status(),
  );

  /** Empty master (no items at all, not just an empty search) → show the setup order hint. */
  protected readonly showSetupHint = computed(
    () => !this.loading() && !this.error() && this.total() === 0 && !this.hasFilters(),
  );

  ngOnInit(): void {
    this.categories
      .list({ limit: 1000, sort: 'name' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => this.categoryOptions.set(res.data.map((c) => ({ label: c.name, value: c.id }))));
  }

  protected fetch(query: ListQuery) {
    return this.items.list(query);
  }

  protected override filters(): ListQuery {
    return {
      categoryId: this.categoryId() ?? undefined,
      type: this.type() ?? undefined,
      status: this.status() ?? undefined,
    };
  }

  override onSearch(term: string): void {
    this.searching.set(!!term);
    super.onSearch(term);
  }

  protected setCategory(value: string | null): void {
    this.categoryId.set(value ?? null);
    this.applyFilters();
  }

  protected setType(value: ItemType | null): void {
    this.type.set(value ?? null);
    this.applyFilters();
  }

  protected setStatus(value: Status | null): void {
    this.status.set(value ?? null);
    this.applyFilters();
  }

  protected clearFilters(): void {
    this.categoryId.set(null);
    this.type.set(null);
    this.status.set(null);
    this.applyFilters();
  }

  protected typeName(item: Item): string {
    return ITEM_TYPE_LABEL[item.type];
  }

  protected isLowStock(item: Item): boolean {
    return item.type !== 'SALE' && item.currentStock <= item.minStock;
  }

  protected openForm(item: Item | null = null): void {
    this.editing.set(item);
    this.formVisible.set(true);
  }

  protected remove(item: Item): void {
    void this.confirmAndDelete(`item "${item.name}"`, () => this.items.remove(item.id));
  }
}
