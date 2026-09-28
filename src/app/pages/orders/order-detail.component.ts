import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Bill } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BillService } from '../../core/services/bill.service';
import { PrintService } from '../../core/services/print.service';
import { ShareService } from '../../core/services/share.service';
import { PAYMENT_MODE_LABEL } from '../../core/utils/constants';
import { apiErrorMessage } from '../../core/utils/http-error.util';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstDateTimePipe, QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { CancelBillDialogComponent } from './cancel-bill-dialog.component';

@Component({
  selector: 'app-order-detail',
  imports: [
    RouterLink,
    ButtonModule,
    SkeletonModule,
    TableModule,
    StatusTagComponent,
    EmptyStateComponent,
    CancelBillDialogComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
    QtyPipe,
  ],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
})
export class OrderDetailComponent {
  /** Route param (component input binding). */
  readonly id = input.required<string>();

  private readonly bills = inject(BillService);
  private readonly print = inject(PrintService);
  private readonly share = inject(ShareService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly bill = signal<Bill | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelOpen = signal(false);
  protected readonly modeLabel = PAYMENT_MODE_LABEL;

  constructor() {
    effect(() => this.load(this.id()));
  }

  protected load(id: string = this.id()): void {
    this.loading.set(true);
    this.error.set(null);
    this.bills.get(id).subscribe({
      next: (b) => {
        this.bill.set(b);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected reprint(b: Bill): void {
    this.print.print({ kind: 'receipt', bill: b, duplicate: true });
  }

  protected shareBill(b: Bill): void {
    this.share.shareBill(b);
  }

  protected resume(b: Bill): void {
    void this.router.navigate(['/billing'], { queryParams: { resume: b.id } });
  }

  protected onCancelled(b: Bill): void {
    this.bill.set(b);
  }
}
