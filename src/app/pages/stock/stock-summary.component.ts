import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { firstValueFrom, tap } from 'rxjs';
import { Category, ListQuery, StockSummaryRow, StockSummaryTotals } from '../../core/models';
import { CategoryService } from '../../core/services/category.service';
import { ExportColumn, ExportService } from '../../core/services/export.service';
import { StockReportService } from '../../core/services/stock-report.service';
import { DatePreset, DateRange, displayDate, presetRange } from '../../core/utils/date.util';
import { formatAmount, formatQty } from '../../core/utils/format.util';
import { ListPageBase } from '../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../shared/components/skeleton-row/skeleton-row.component';
import { QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { StockAdjustDialogComponent } from './stock-adjust-dialog.component';
import { StockLedgerDialogComponent } from './stock-ledger-dialog.component';
import { EXPORT_PAGE_SIZE, STOCK_TYPE_OPTIONS } from './stock.shared';

/**
 * Stock register (ADMIN): one row per raw material with
 * opening + purchased + adjusted − used − wastage − sold = balance, for the chosen period ("All time" by default).
 */
@Component({
  selector: 'app-stock-summary',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    ToggleSwitchModule,
    TooltipModule,
    PageHeaderComponent,
    DateRangeFilterComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    QtyPipe,
    StockAdjustDialogComponent,
    StockLedgerDialogComponent,
  ],
  templateUrl: './stock-summary.component.html',
  styleUrl: './stock.scss',
})
export class StockSummaryComponent extends ListPageBase<StockSummaryRow> implements OnInit {
  private readonly report = inject(StockReportService);
  private readonly categoryService = inject(CategoryService);
  private readonly exporter = inject(ExportService);
  private readonly route = inject(ActivatedRoute);

  protected readonly typeOptions = STOCK_TYPE_OPTIONS;
  protected readonly categories = signal<Category[]>([]);

  // Filters
  protected readonly preset = signal<DatePreset>('ALL');
  protected readonly range = signal<DateRange>(presetRange('ALL'));
  protected readonly categoryId = signal<string | null>(null);
  protected readonly type = signal<'RAW' | 'BOTH' | null>(null);
  protected readonly lowOnly = signal(false);

  /** Totals over every item matching the filters (not just the page). */
  protected readonly sums = signal<StockSummaryTotals | null>(null);
  protected readonly exporting = signal<'excel' | 'pdf' | null>(null);

  // Dialogs
  protected readonly ledgerVisible = signal(false);
  protected readonly ledgerItem = signal<StockSummaryRow | null>(null);
  protected readonly adjustVisible = signal(false);
  protected readonly adjustItem = signal<StockSummaryRow | null>(null);

  constructor() {
    super();
    this.sort = 'name';
  }

  ngOnInit(): void {
    // The dashboard's "Low Stock" card links here with ?low=1.
    if (this.route.snapshot.queryParamMap.get('low') === '1') this.lowOnly.set(true);
    this.categoryService.listActive().subscribe({
      next: (res) => this.categories.set(res.data),
      error: () => this.categories.set([]),
    });
  }

  protected fetch(query: ListQuery) {
    return this.report.summary(query).pipe(
      tap({
        next: (res) => this.sums.set(res.totals ?? null),
        error: () => this.sums.set(null),
      }),
    );
  }

  protected override filters(): ListQuery {
    const r = this.range();
    return { from: r.from, to: r.to, categoryId: this.categoryId(), type: this.type(), lowOnly: this.lowOnly() || undefined };
  }

  protected onCategory(id: string | null): void {
    this.categoryId.set(id);
    this.applyFilters();
  }

  protected onType(value: 'RAW' | 'BOTH' | null): void {
    this.type.set(value);
    this.applyFilters();
  }

  protected onLowOnly(value: boolean): void {
    this.lowOnly.set(value);
    this.applyFilters();
  }

  /** "All time" or "01-10-2026 to 16-10-2026" */
  protected periodLabel(): string {
    const { from, to } = this.range();
    if (!from && !to) return 'All time';
    if (from === to) return displayDate(from);
    return `${displayDate(from)} to ${displayDate(to)}`;
  }

  protected openLedger(row: StockSummaryRow): void {
    this.ledgerItem.set(row);
    this.ledgerVisible.set(true);
  }

  protected openAdjust(row: StockSummaryRow): void {
    this.adjustItem.set(row);
    this.adjustVisible.set(true);
  }

  private exportColumns(): ExportColumn<StockSummaryRow>[] {
    return [
      { header: 'Code', value: (r) => r.code, width: 10 },
      { header: 'Item', value: (r) => r.name, width: 28 },
      { header: 'Category', value: (r) => r.categoryName, width: 16 },
      { header: 'Unit', value: (r) => r.unitCode, width: 6 },
      { header: 'Opening', value: (r) => formatQty(r.opening), width: 10, align: 'right' },
      { header: 'Purchased', value: (r) => formatQty(r.purchased), width: 10, align: 'right' },
      { header: 'Used', value: (r) => formatQty(r.used), width: 10, align: 'right' },
      { header: 'Wastage', value: (r) => formatQty(r.wastage), width: 10, align: 'right' },
      { header: 'Sold', value: (r) => formatQty(r.sold), width: 10, align: 'right' },
      { header: 'Adjusted', value: (r) => formatQty(r.adjusted), width: 10, align: 'right' },
      { header: 'Balance', value: (r) => formatQty(r.closing), width: 10, align: 'right' },
      { header: 'Min', value: (r) => formatQty(r.minStock), width: 8, align: 'right' },
      { header: 'Rate', value: (r) => formatAmount(r.purchasePrice), width: 10, align: 'right' },
      { header: 'Value', value: (r) => formatAmount(r.stockValue), width: 12, align: 'right' },
      { header: 'Low', value: (r) => (r.isLow ? 'Yes' : ''), width: 6 },
    ];
  }

  protected async export(kind: 'excel' | 'pdf'): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(kind);
    try {
      // The API returns at most 1000 rows per page, so collect every page.
      const query: ListQuery = { ...this.filters(), limit: EXPORT_PAGE_SIZE, search: this.searchTerm || undefined, sort: this.sort };
      const res = await firstValueFrom(this.report.summary({ ...query, page: 1 }));
      for (let page = 2; res.data.length < res.total; page++) {
        const next = await firstValueFrom(this.report.summary({ ...query, page }));
        if (next.data.length === 0) break;
        res.data.push(...next.data);
      }
      if (res.data.length === 0) {
        this.notify.info('There are no items to export for the selected filters.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `stock-summary_${stamp}`;
      if (kind === 'excel') {
        await this.exporter.toExcel(fileName, 'Stock Summary', this.exportColumns(), res.data);
      } else {
        const t = res.totals;
        const subtitle =
          `Period: ${this.periodLabel()} · ${res.data.length} items · ${t.lowCount} low · ` +
          `Purchased ${formatQty(t.purchased)} · Used ${formatQty(t.used)} · Stock value Rs ${formatAmount(t.stockValue)}`;
        await this.exporter.toPdf(fileName, 'Stock Summary', subtitle, this.exportColumns(), res.data);
      }
      this.notify.success(`${kind === 'excel' ? 'Excel' : 'PDF'} file downloaded`, 'Exported');
    } catch (err: unknown) {
      // HTTP errors are already toasted by the interceptor.
      if (!(err instanceof HttpErrorResponse)) this.notify.error('Could not create the export file. Please try again.');
    } finally {
      this.exporting.set(null);
    }
  }
}
