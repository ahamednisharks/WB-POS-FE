import { Component, input } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { SalaryPayment } from '../../../core/models';
import { BANK_PAYMENT_MODE_LABEL } from '../../../core/utils/constants';
import { IstDatePipe, MonthLabelPipe } from '../../pipes/display.pipes';
import { InrCurrencyPipe } from '../../pipes/inr-currency.pipe';

@Component({
  selector: 'app-salary-slip',
  imports: [InrCurrencyPipe, IstDatePipe, MonthLabelPipe],
  template: `
    @let p = payment();
    <div class="doc">
      <div class="head">
        <div>
          <div class="shop">{{ shop.name }}</div>
          <div class="muted">{{ shop.address }}</div>
        </div>
        <div class="doc-title">SALARY SLIP<br /><span class="muted">{{ p.month | monthLabel }}</span></div>
      </div>
      <div class="grid2">
        <div class="box">
          <h4>Employee</h4>
          <div><strong>{{ p.employeeName }}</strong> ({{ p.empCode }})</div>
        </div>
        <div class="box">
          <h4>Attendance</h4>
          <div>Working days: {{ p.workingDays }} · Present: {{ p.daysPresent }}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Earnings</th><th class="r">Amount</th><th>Deductions</th><th class="r">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Gross salary</td><td class="r">{{ p.gross | inr }}</td>
            <td>Advance</td><td class="r">{{ p.advanceDeduction | inr }}</td>
          </tr>
          <tr>
            <td>Bonus / Overtime</td><td class="r">{{ p.bonus | inr }}</td>
            <td>Other{{ p.deductionReason ? ' (' + p.deductionReason + ')' : '' }}</td><td class="r">{{ p.otherDeductions | inr }}</td>
          </tr>
          <tr>
            <th>Total earnings</th><th class="r">{{ p.gross + p.bonus | inr }}</th>
            <th>Total deductions</th><th class="r">{{ p.advanceDeduction + p.otherDeductions | inr }}</th>
          </tr>
        </tbody>
      </table>
      <div class="totals">
        <div class="kv grand"><span>Net salary</span><span>{{ p.net | inr }}</span></div>
        <div class="kv"><span>Status</span><span>{{ p.status === 'PAID' ? 'Paid' : 'Pending' }}</span></div>
        @if (p.paymentDate) {
          <div class="kv"><span>Paid on</span><span>{{ p.paymentDate | istDate }}</span></div>
        }
        @if (p.paymentMode) {
          <div class="kv"><span>Mode</span><span>{{ modeLabel[p.paymentMode] }}</span></div>
        }
      </div>
      <div class="sign"><div>Employee signature</div><div>Authorised signatory</div></div>
    </div>
  `,
  styleUrl: './print-a4.scss',
})
export class SalarySlipComponent {
  readonly payment = input.required<SalaryPayment>();
  protected readonly shop = environment.shop;
  protected readonly modeLabel = BANK_PAYMENT_MODE_LABEL;
}
