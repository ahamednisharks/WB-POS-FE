import { Component, input } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Bill } from '../../../core/models';
import { PAYMENT_MODE_LABEL } from '../../../core/utils/constants';
import { IstDateTimePipe, QtyPipe } from '../../pipes/display.pipes';
import { InrCurrencyPipe } from '../../pipes/inr-currency.pipe';

/** 80mm thermal receipt. */
@Component({
  selector: 'app-receipt',
  imports: [InrCurrencyPipe, IstDateTimePipe, QtyPipe],
  templateUrl: './receipt.component.html',
  styleUrl: './print-roll.scss',
})
export class ReceiptComponent {
  readonly bill = input.required<Bill>();
  readonly duplicate = input(false);
  protected readonly shop = environment.shop;
  protected readonly modeLabel = PAYMENT_MODE_LABEL;
}
