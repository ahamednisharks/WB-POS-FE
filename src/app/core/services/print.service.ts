import { afterNextRender, inject, Injectable, Injector, signal } from '@angular/core';
import { Bill, DayClose, PurchaseEntry, PurchaseOrder, SalaryPayment } from '../models';

export type PrintJob =
  | { kind: 'receipt'; bill: Bill; duplicate: boolean }
  | { kind: 'day-close'; dayClose: DayClose }
  | { kind: 'salary-slip'; payment: SalaryPayment }
  | { kind: 'purchase-order'; po: PurchaseOrder }
  | { kind: 'purchase-entry'; pe: PurchaseEntry };

const PAGE_STYLE_ID = 'wbpos-print-page';

/**
 * Renders the job into the print-only <app-print-host> (outside ion-app) and calls window.print().
 * Receipts / day-close slips use an 80mm roll layout, other documents A4.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private readonly injector = inject(Injector);
  readonly job = signal<PrintJob | null>(null);

  print(job: PrintJob): void {
    const roll = job.kind === 'receipt' || job.kind === 'day-close';
    this.setPageStyle(roll ? '@page { size: 80mm auto; margin: 2mm; }' : '@page { size: A4; margin: 12mm; }');
    this.job.set(job);
    afterNextRender(
      () => {
        // Give images/fonts a tick to settle before the print dialog blocks the thread.
        setTimeout(() => window.print(), 50);
      },
      { injector: this.injector },
    );
  }

  private setPageStyle(css: string): void {
    let el = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = PAGE_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = `@media print { ${css} }`;
  }
}
