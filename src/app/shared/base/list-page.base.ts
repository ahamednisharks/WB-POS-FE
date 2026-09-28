import { Directive, inject, signal } from '@angular/core';
import { TableLazyLoadEvent } from 'primeng/table';
import { Observable, Subscription } from 'rxjs';
import { DeleteResult, ListQuery, PagedResult } from '../../core/models';
import { NotifyService } from '../../core/services/notify.service';
import { PAGE_SIZE_OPTIONS } from '../../core/utils/constants';
import { apiErrorMessage } from '../../core/utils/http-error.util';
import { ConfirmService } from '../components/confirm-delete/confirm.service';

/**
 * Shared state for server-paginated list screens (p-table in lazy mode):
 * paging, sorting (newest first), debounced search, filters, loading/error and delete-with-confirm.
 */
@Directive()
export abstract class ListPageBase<T extends { id: string }> {
  protected readonly notify = inject(NotifyService);
  protected readonly confirm = inject(ConfirmService);

  readonly rows = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly first = signal(0);
  readonly pageSize = signal(PAGE_SIZE_OPTIONS[0]);
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected searchTerm = '';
  protected sort = '-createdAt';
  private sub?: Subscription;

  /** Calls the list endpoint. */
  protected abstract fetch(query: ListQuery): Observable<PagedResult<T>>;

  /** Screen-specific filters merged into every query. */
  protected filters(): ListQuery {
    return {};
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.first.set(event.first ?? 0);
    if (event.rows) this.pageSize.set(event.rows);
    const field = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    if (field) this.sort = `${event.sortOrder === -1 ? '-' : ''}${field}`;
    this.load();
  }

  onSearch(term: string): void {
    this.searchTerm = term;
    this.first.set(0);
    this.load();
  }

  /** Call after changing a filter. */
  applyFilters(): void {
    this.first.set(0);
    this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const query: ListQuery = {
      page: Math.floor(this.first() / this.pageSize()) + 1,
      limit: this.pageSize(),
      search: this.searchTerm || undefined,
      sort: this.sort,
      ...this.filters(),
    };
    this.sub = this.fetch(query).subscribe({
      next: (res) => {
        this.rows.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
        // Deleted the last row of the last page → step back a page.
        if (res.data.length === 0 && res.total > 0 && this.first() > 0) {
          this.first.set(Math.max(0, this.first() - this.pageSize()));
          this.load();
        }
      },
      error: (err: unknown) => {
        this.rows.set([]);
        this.total.set(0);
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /** Confirm → DELETE → toast the backend message (deleted or marked inactive) → reload. */
  protected async confirmAndDelete(label: string, remove: () => Observable<DeleteResult>): Promise<void> {
    if (!(await this.confirm.confirmDelete(label))) return;
    remove().subscribe({
      next: (res) => {
        if (res.deleted) this.notify.success(res.message, 'Deleted');
        else this.notify.warn(res.message, 'Marked inactive');
        this.load();
      },
    });
  }
}
