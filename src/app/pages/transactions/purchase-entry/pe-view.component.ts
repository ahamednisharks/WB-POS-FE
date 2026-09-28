import { Component, computed, inject, input, model, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { PurchaseEntry } from '../../../core/models';
import { PrintService } from '../../../core/services/print.service';
import { BANK_PAYMENT_MODE_LABEL } from '../../../core/utils/constants';
import { todayIST } from '../../../core/utils/date.util';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe, IstDateTimePipe, QtyPipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

/** Read-only Purchase Entry: details, items, totals, payment history. */
@Component({
  selector: 'app-pe-view',
  imports: [ButtonModule, FormDialogComponent, StatusTagComponent, InrCurrencyPipe, IstDatePipe, IstDateTimePipe, QtyPipe],
  templateUrl: './pe-view.component.html',
  styleUrl: '../purchase-order/purchase-shared.scss',
})
export class PeViewComponent {
  readonly visible = model(false);
  readonly pe = input<PurchaseEntry | null>(null);
  readonly addPayment = output<PurchaseEntry>();

  private readonly printer = inject(PrintService);

  protected readonly modeLabel = BANK_PAYMENT_MODE_LABEL;
  protected readonly overdue = computed(() => {
    const pe = this.pe();
    return !!pe && pe.balance > 0 && !!pe.dueDate && pe.dueDate < todayIST();
  });

  protected print(): void {
    const pe = this.pe();
    if (pe) this.printer.print({ kind: 'purchase-entry', pe });
  }

  protected pay(): void {
    const pe = this.pe();
    if (pe) this.addPayment.emit(pe);
  }
}
