import { Component, input } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { DayClose } from '../../../core/models';
import { IstDatePipe, IstDateTimePipe } from '../../pipes/display.pipes';
import { InrCurrencyPipe } from '../../pipes/inr-currency.pipe';

/** 80mm day-close (cash tally) slip. */
@Component({
  selector: 'app-day-close-slip',
  imports: [InrCurrencyPipe, IstDatePipe, IstDateTimePipe],
  template: `
    @let d = dayClose();
    <div class="roll">
      <div class="center">
        <div class="shop">{{ shop.name }}</div>
        <div class="small">{{ shop.address }}</div>
      </div>
      <div class="rule"></div>
      <div class="center bold">DAY CLOSE — {{ d.date | istDate }}</div>
      <div class="rule"></div>
      <div class="kv"><span>Opening cash</span><span>{{ d.openingCash | inr }}</span></div>
      <div class="kv"><span>+ Cash sales</span><span>{{ d.cashSales | inr }}</span></div>
      <div class="kv"><span>− Cash refunds</span><span>{{ d.cashRefunds | inr }}</span></div>
      <div class="kv"><span>− Cash-outs</span><span>{{ d.cashOuts | inr }}</span></div>
      <div class="rule"></div>
      <div class="kv total"><span>Expected</span><span>{{ d.expectedCash | inr }}</span></div>
      <div class="kv total"><span>Counted</span><span>{{ d.countedCash | inr }}</span></div>
      <div class="kv diff"><span>Difference</span><span>{{ d.difference | inr }}</span></div>
      @if (d.remarks) {
        <div class="rule"></div>
        <div class="small">Remarks: {{ d.remarks }}</div>
      }
      <div class="rule"></div>
      <div class="small">Closed by {{ d.closedByName }} on {{ d.createdAt | istDateTime }}</div>
      <br />
      <div class="kv small"><span>Cashier sign</span><span>Manager sign</span></div>
      <br />
    </div>
  `,
  styleUrl: './print-roll.scss',
})
export class DayCloseSlipComponent {
  readonly dayClose = input.required<DayClose>();
  protected readonly shop = environment.shop;
}
