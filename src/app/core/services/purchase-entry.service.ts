import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PurchaseEntry, PurchaseEntryPage, PurchaseEntrySave, PurchasePaymentRequest } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class PurchaseEntryService extends CrudService<PurchaseEntry, PurchaseEntrySave> {
  protected readonly path = '/purchase-entries';

  override list(query: ListQuery = {}): Observable<PurchaseEntryPage> {
    return this.api.get<PurchaseEntryPage>(this.path, query);
  }

  addPayment(id: string, body: PurchasePaymentRequest): Observable<PurchaseEntry> {
    return this.api.post<PurchaseEntry>(`${this.path}/${id}/payments`, body);
  }
}
