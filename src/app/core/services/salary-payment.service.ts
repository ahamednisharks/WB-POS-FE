import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BankPaymentMode, ListQuery, SalaryPayment, SalaryPaymentPage, SalaryPaymentSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class SalaryPaymentService extends CrudService<SalaryPayment, SalaryPaymentSave> {
  protected readonly path = '/salary-payments';

  override list(query: ListQuery = {}): Observable<SalaryPaymentPage> {
    return this.api.get<SalaryPaymentPage>(this.path, query);
  }

  /** Recovers advances and records the cash-out server-side; gross / net stay as saved. */
  markPaid(payment: SalaryPayment, paymentDate: string, paymentMode: BankPaymentMode): Observable<SalaryPayment> {
    return this.api.post<SalaryPayment>(`${this.path}/${payment.id}/mark-paid`, { paymentDate, paymentMode });
  }
}
