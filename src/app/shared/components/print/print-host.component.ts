import { Component, inject } from '@angular/core';
import { PrintService } from '../../../core/services/print.service';
import { DayCloseSlipComponent } from './day-close-slip.component';
import { PurchaseDocComponent } from './purchase-doc.component';
import { ReceiptComponent } from './receipt.component';
import { SalarySlipComponent } from './salary-slip.component';

/** Print-only area (hidden on screen). PrintService puts a job here and calls window.print(). */
@Component({
  selector: 'app-print-host',
  imports: [ReceiptComponent, DayCloseSlipComponent, SalarySlipComponent, PurchaseDocComponent],
  host: { class: 'print-host', 'aria-hidden': 'true' },
  template: `
    @if (print.job(); as job) {
      @if (job.kind === 'receipt') {
        <app-receipt [bill]="job.bill" [duplicate]="job.duplicate" />
      } @else if (job.kind === 'day-close') {
        <app-day-close-slip [dayClose]="job.dayClose" />
      } @else if (job.kind === 'salary-slip') {
        <app-salary-slip [payment]="job.payment" />
      } @else if (job.kind === 'purchase-order') {
        <app-purchase-doc [po]="job.po" />
      } @else if (job.kind === 'purchase-entry') {
        <app-purchase-doc [pe]="job.pe" />
      }
    }
  `,
})
export class PrintHostComponent {
  protected readonly print = inject(PrintService);
}
