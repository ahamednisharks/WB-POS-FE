import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PurchaseOrder, PurchaseOrderSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class PurchaseOrderService extends CrudService<PurchaseOrder, PurchaseOrderSave> {
  protected readonly path = '/purchase-orders';

  cancel(id: string, reason: string): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`${this.path}/${id}/cancel`, { reason });
  }
}
