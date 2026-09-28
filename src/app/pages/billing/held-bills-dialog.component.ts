import { Component, effect, inject, model, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { Bill } from '../../core/models';
import { BillService } from '../../core/services/bill.service';
import { NotifyService } from '../../core/services/notify.service';
import { apiErrorMessage } from '../../core/utils/http-error.util';
import { ConfirmService } from '../../shared/components/confirm-delete/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { IstDateTimePipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';

/** Lists bills on hold → Resume or Discard. */
@Component({
  selector: 'app-held-bills-dialog',
  imports: [ButtonModule, SkeletonModule, FormDialogComponent, EmptyStateComponent, InrCurrencyPipe, IstDateTimePipe],
  template: `
    <app-form-dialog [(visible)]="visible" header="Held Bills" width="620px">
      @if (loading()) {
        @for (r of [1, 2, 3]; track r) {
          <p-skeleton height="3.5rem" styleClass="mb-2" />
        }
      } @else if (error(); as e) {
        <app-empty-state icon="pi pi-exclamation-triangle" title="Could not load held bills" [message]="e" actionLabel="Retry" (action)="load()" [compact]="true" />
      } @else {
        <ul class="held">
          @for (b of bills(); track b.id) {
            <li>
              <div class="info">
                <div class="no">{{ b.billNo }} <span class="muted small">· {{ b.itemCount }} item(s)</span></div>
                <div class="muted small">
                  {{ b.billDate | istDateTime }} · {{ b.cashierName }}
                  @if (b.customerName || b.customerMobile) {
                    · {{ b.customerName || b.customerMobile }}
                  }
                </div>
              </div>
              <div class="amt num">{{ b.grandTotal | inr }}</div>
              <div class="acts">
                <p-button label="Resume" icon="pi pi-play" size="small" (onClick)="resume.emit(b)" />
                <p-button
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  [text]="true"
                  [rounded]="true"
                  ariaLabel="Discard held bill"
                  (onClick)="discard(b)"
                />
              </div>
            </li>
          } @empty {
            <app-empty-state icon="pi pi-pause" title="No bills on hold" message="Use Hold (F8) to park a bill and serve the next customer." [compact]="true" />
          }
        </ul>
      }
      <div dialogFooter class="dialog-footer">
        <p-button label="Close" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
      </div>
    </app-form-dialog>
  `,
  styles: `
    .held {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 0.75rem;
      align-items: center;
      padding: 0.7rem 0.25rem;
      border-bottom: 1px solid var(--border-soft);
    }
    .no {
      font-weight: 700;
    }
    .amt {
      font-weight: 700;
    }
    .acts {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }
    :host ::ng-deep .mb-2 {
      margin-bottom: 0.5rem;
    }
    @media (max-width: 480px) {
      li {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .acts {
        grid-column: 1 / -1;
        justify-content: flex-end;
      }
    }
  `,
})
export class HeldBillsDialogComponent {
  readonly visible = model(false);
  readonly resume = output<Bill>();
  readonly changed = output<void>();

  private readonly billService = inject(BillService);
  private readonly confirm = inject(ConfirmService);
  private readonly notify = inject(NotifyService);

  protected readonly bills = signal<Bill[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.visible()) this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.billService.list({ status: 'HELD', limit: 50, sort: '-billDate' }).subscribe({
      next: (res) => {
        this.bills.set(res.data);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected async discard(bill: Bill): Promise<void> {
    const ok = await this.confirm.ask({
      header: 'Discard held bill',
      message: `Discard ${bill.billNo} (${bill.itemCount} item(s))? It cannot be resumed afterwards.`,
      acceptLabel: 'Discard',
      danger: true,
      icon: 'pi pi-trash',
    });
    if (!ok) return;
    this.billService.cancel(bill.id, 'Discarded from hold').subscribe({
      next: () => {
        this.notify.info(`${bill.billNo} discarded`);
        this.load();
        this.changed.emit();
      },
    });
  }
}
