import { Component, effect, inject, input, model, signal, untracked } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { EMPTY, tap } from 'rxjs';
import { ListQuery, StockLedgerItem, StockLedgerRow } from '../../core/models';
import { ItemService } from '../../core/services/item.service';
import { DatePreset, DateRange, presetRange } from '../../core/utils/date.util';
import { ListPageBase } from '../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SkeletonRowComponent } from '../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe, QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { STOCK_TXN_LABEL } from './stock.shared';

/** Every stock movement of one item, newest first, with the document that caused it (ADMIN). */
@Component({
  selector: 'app-stock-ledger-dialog',
  imports: [
    ButtonModule,
    TableModule,
    DateRangeFilterComponent,
    EmptyStateComponent,
    FormDialogComponent,
    SkeletonRowComponent,
    StatusTagComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
    QtyPipe,
  ],
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './stock.scss'],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Stock Ledger — ' + (item()?.name ?? '')" width="980px" [maximizable]="true">
      @if (ledgerItem(); as h) {
        <div class="detail-grid ledger-strip">
          <div class="dl">
            <span>Item</span>
            <span>{{ h.name }} <span class="muted small">({{ h.code }})</span></span>
          </div>
          <div class="dl">
            <span>Category</span>
            <span>{{ h.categoryName }}</span>
          </div>
          <div class="dl">
            <span>Current Stock</span>
            <span [class.low-stock]="h.minStock > 0 && h.currentStock <= h.minStock">{{ h.currentStock | qty }} {{ h.unitCode }}</span>
          </div>
          <div class="dl">
            <span>Min Stock</span>
            <span>{{ h.minStock | qty }} {{ h.unitCode }}</span>
          </div>
          <div class="dl">
            <span>Last Rate</span>
            <span>{{ h.purchasePrice | inr }}</span>
          </div>
        </div>
      }

      <div class="ledger-filters">
        <app-date-range-filter [(preset)]="preset" [(range)]="range" [allowAll]="true" label="Period" (changed)="applyFilters()" />
      </div>

      <p-table
        [value]="loading() ? [] : rows()"
        [lazy]="true"
        [lazyLoadOnInit]="false"
        (onLazyLoad)="onLazyLoad($event)"
        [paginator]="true"
        [rows]="pageSize()"
        [first]="first()"
        [totalRecords]="total()"
        [rowsPerPageOptions]="pageSizeOptions"
        [showCurrentPageReport]="true"
        currentPageReportTemplate="{first}–{last} of {totalRecords}"
        [loading]="loading()"
        [showLoader]="false"
        dataKey="id"
        [scrollable]="true"
        [rowHover]="true"
        [tableStyle]="{ 'min-width': '56rem' }"
      >
        <ng-template #header>
          <tr>
            <th>Date &amp; Time</th>
            <th>Movement</th>
            <th>Reference</th>
            <th class="text-right">In</th>
            <th class="text-right">Out</th>
            <th class="text-right">Balance</th>
            <th>By</th>
          </tr>
        </ng-template>
        <ng-template #body let-l>
          <tr>
            <td class="nowrap">{{ l.txnDate | istDateTime }}</td>
            <td><app-status-tag [status]="l.type" [label]="txnLabelOf(l.type)" /></td>
            <td>
              <span class="nowrap">{{ l.refNo || '—' }}</span>
              @if (l.refNote) {
                <div class="muted small">{{ l.refNote }}</div>
              }
            </td>
            <td class="text-right num" [class.zero]="l.qtyIn === 0">{{ l.qtyIn === 0 ? '—' : '+' + (l.qtyIn | qty) }}</td>
            <td class="text-right num" [class.zero]="l.qtyOut === 0">{{ l.qtyOut === 0 ? '—' : '−' + (l.qtyOut | qty) }}</td>
            <td class="text-right num bold">{{ l.balanceAfter | qty }}</td>
            <td class="muted">{{ l.createdByName || '—' }}</td>
          </tr>
        </ng-template>
        <ng-template #loadingbody>
          @for (r of skeletonRows; track r) {
            <tr appSkeletonRow [cols]="7"></tr>
          }
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="7">
              @if (error(); as e) {
                <app-empty-state icon="pi pi-exclamation-triangle" title="Could not load the ledger" [message]="e" actionLabel="Retry" (action)="load()" [compact]="true" />
              } @else {
                <app-empty-state icon="pi pi-history" title="No movements in this period" message="Purchases, issues, sales and adjustments of this item appear here." [compact]="true" />
              }
            </td>
          </tr>
        </ng-template>
      </p-table>

      <div dialogFooter class="dialog-footer">
        <p-button label="Close" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
      </div>
    </app-form-dialog>
  `,
})
export class StockLedgerDialogComponent extends ListPageBase<StockLedgerRow> {
  readonly visible = model(false);
  readonly item = input<{ id: string; name: string } | null>(null);

  private readonly items = inject(ItemService);

  /** Item header returned with every page (named so it does not clash with the table's #header template). */
  protected readonly ledgerItem = signal<StockLedgerItem | null>(null);
  protected readonly preset = signal<DatePreset>('MONTH');
  protected readonly range = signal<DateRange>(presetRange('MONTH'));

  constructor() {
    super();
    this.pageSize.set(25);
    // The table does not load on init (it is re-created every time the dialog opens): load here instead.
    effect(() => {
      if (!this.visible()) return;
      this.item();
      untracked(() => {
        this.ledgerItem.set(null);
        this.first.set(0);
        this.load();
      });
    });
  }

  protected fetch(query: ListQuery) {
    const it = this.item();
    if (!it) return EMPTY;
    return this.items.stockLedger(it.id, query).pipe(tap((res) => this.ledgerItem.set(res.item)));
  }

  protected txnLabelOf(type: string): string {
    return (STOCK_TXN_LABEL as Record<string, string>)[type] ?? type;
  }

  protected override filters(): ListQuery {
    const r = this.range();
    return { from: r.from, to: r.to };
  }
}
