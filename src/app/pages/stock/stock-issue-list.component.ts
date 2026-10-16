import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { tap } from 'rxjs';
import { IssueReason, ListQuery, StockIssue, StockIssueStatus, StockIssueTotals } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { StockIssueService } from '../../core/services/stock-issue.service';
import { DatePreset, DateRange, presetRange } from '../../core/utils/date.util';
import { ListPageBase } from '../../shared/base/list-page.base';
import { DateRangeFilterComponent } from '../../shared/components/date-range-filter/date-range-filter.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDatePipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { StockIssueCancelDialogComponent } from './stock-issue-cancel-dialog.component';
import { StockIssueFormComponent } from './stock-issue-form.component';
import { StockIssueViewComponent } from './stock-issue-view.component';
import { ISSUE_REASON_LABEL, ISSUE_REASON_OPTIONS, ISSUE_STATUS_OPTIONS } from './stock.shared';

/** Stock Issue list (ADMIN + CASHIER): raw material sent to production / written off. */
@Component({
  selector: 'app-stock-issue-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    DateRangeFilterComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    IstDatePipe,
    StockIssueFormComponent,
    StockIssueViewComponent,
    StockIssueCancelDialogComponent,
  ],
  templateUrl: './stock-issue-list.component.html',
  styleUrl: './stock.scss',
})
export class StockIssueListComponent extends ListPageBase<StockIssue> {
  private readonly issues = inject(StockIssueService);
  protected readonly auth = inject(AuthService);

  protected readonly reasonOptions = ISSUE_REASON_OPTIONS;
  protected readonly reasonLabel = ISSUE_REASON_LABEL;
  protected readonly statusOptions = ISSUE_STATUS_OPTIONS;

  // Filters
  protected readonly preset = signal<DatePreset>('MONTH');
  protected readonly range = signal<DateRange>(presetRange('MONTH'));
  protected readonly reason = signal<IssueReason | null>(null);
  protected readonly status = signal<StockIssueStatus | null>(null);

  /** Footer totals over every issue matching the filters (not just the page). */
  protected readonly sums = signal<StockIssueTotals | null>(null);

  // Dialogs
  protected readonly formVisible = signal(false);
  protected readonly editing = signal<StockIssue | null>(null);
  protected readonly viewVisible = signal(false);
  protected readonly viewing = signal<StockIssue | null>(null);
  protected readonly cancelVisible = signal(false);
  protected readonly cancelling = signal<StockIssue | null>(null);
  /** Row whose full record is being fetched (spinner on its button). */
  protected readonly opening = signal<string | null>(null);

  protected fetch(query: ListQuery) {
    return this.issues.list(query).pipe(
      tap({
        next: (res) => this.sums.set(res.totals ?? null),
        error: () => this.sums.set(null),
      }),
    );
  }

  protected override filters(): ListQuery {
    const r = this.range();
    return { from: r.from, to: r.to, reason: this.reason(), status: this.status() };
  }

  protected onReason(value: IssueReason | null): void {
    this.reason.set(value);
    this.applyFilters();
  }

  protected onStatus(value: StockIssueStatus | null): void {
    this.status.set(value);
    this.applyFilters();
  }

  /** "PRODUCTION,WASTAGE" → ['PRODUCTION', 'WASTAGE'] */
  protected reasonsOf(row: StockIssue): IssueReason[] {
    return (row.reasons ?? '').split(',').filter((r): r is IssueReason => r.length > 0);
  }

  /** List rows carry no lines — load the full issue before showing it. */
  private withDetails(row: StockIssue, open: (full: StockIssue) => void): void {
    this.opening.set(row.id);
    this.issues.get(row.id).subscribe({
      next: (full) => {
        this.opening.set(null);
        open(full);
      },
      error: () => this.opening.set(null), // the HTTP error interceptor already shows the message
    });
  }

  protected openForm(row: StockIssue | null = null): void {
    const open = (issue: StockIssue | null) => {
      this.editing.set(issue);
      this.formVisible.set(true);
    };
    if (row) this.withDetails(row, open);
    else open(null);
  }

  protected view(row: StockIssue): void {
    this.withDetails(row, (full) => {
      this.viewing.set(full);
      this.viewVisible.set(true);
    });
  }

  protected openCancel(row: StockIssue): void {
    this.cancelling.set(row);
    this.cancelVisible.set(true);
  }

  /** From the view dialog: close it and open the form / cancel dialog for the same issue. */
  protected editFromView(issue: StockIssue): void {
    this.viewVisible.set(false);
    this.editing.set(issue);
    this.formVisible.set(true);
  }

  protected cancelFromView(issue: StockIssue): void {
    this.viewVisible.set(false);
    this.openCancel(issue);
  }

  protected onChanged(issue: StockIssue): void {
    if (this.viewing()?.id === issue.id) this.viewing.set(issue);
    this.load();
  }
}
