import { Component, computed, inject, input, model } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PurchaseOrder } from '../../../core/models';
import { PrintService } from '../../../core/services/print.service';
import { ShareService } from '../../../core/services/share.service';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe, IstDateTimePipe, QtyPipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

/** Read-only Purchase Order details with Print / Share / Convert to PE. */
@Component({
  selector: 'app-po-view',
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
  templateUrl: './po-view.component.html',
  styleUrl: './purchase-shared.scss',
})
export class PoViewComponent {
  readonly visible = model(false);
  readonly po = input<PurchaseOrder | null>(null);

  private readonly printer = inject(PrintService);
  private readonly sharer = inject(ShareService);
  private readonly router = inject(Router);

  protected readonly canConvert = computed(() => {
    const status = this.po()?.status;
    return status === 'SENT' || status === 'PARTIAL';
  });

  protected print(): void {
    const po = this.po();
    if (po) this.printer.print({ kind: 'purchase-order', po });
  }

  protected share(): void {
    const po = this.po();
    if (po) this.sharer.sharePurchaseOrder(po);
  }

  protected convert(): void {
    const po = this.po();
    if (!po) return;
    this.visible.set(false);
    void this.router.navigate(['/transactions/purchase-entries'], { queryParams: { fromPo: po.id } });
  }
}
