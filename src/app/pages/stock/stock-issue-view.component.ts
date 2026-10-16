import { Component, inject, input, model, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { StockIssue } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDatePipe, IstDateTimePipe, QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { ISSUE_REASON_LABEL } from './stock.shared';

/** Read-only Stock Issue: details and lines; Edit (same day) and Cancel (admin) hand off to the list. */
@Component({
  selector: 'app-stock-issue-view',
  imports: [
    ButtonModule,
    MessageModule,
    FormDialogComponent,
    StatusTagComponent,
    InrCurrencyPipe,
    IstDatePipe,
    IstDateTimePipe,
    QtyPipe,
  ],
  templateUrl: './stock-issue-view.component.html',
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './stock.scss'],
})
export class StockIssueViewComponent {
  readonly visible = model(false);
  readonly issue = input<StockIssue | null>(null);
  readonly edit = output<StockIssue>();
  readonly cancel = output<StockIssue>();

  protected readonly auth = inject(AuthService);
  protected readonly reasonLabel = ISSUE_REASON_LABEL;

  protected emit(action: 'edit' | 'cancel'): void {
    const issue = this.issue();
    if (!issue) return;
    if (action === 'edit') this.edit.emit(issue);
    else this.cancel.emit(issue);
  }
}
