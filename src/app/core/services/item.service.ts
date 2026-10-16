import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Item, ItemSave, ListQuery, StockAdjustRequest, StockLedgerPage } from '../models';
import { nextCode } from '../utils/format.util';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class ItemService extends CrudService<Item, ItemSave> {
  protected readonly path = '/items';

  /** Suggested code for a new item (ITM0001 style, still editable). */
  suggestCode(): Observable<string> {
    return this.list({ page: 1, limit: 1, sort: '-code' }).pipe(map((res) => nextCode('ITM', res.data[0]?.code, 4)));
  }

  /** Stock movements of one item, newest first (ADMIN). Filters: from, to, page, limit. */
  stockLedger(id: string, query: ListQuery = {}): Observable<StockLedgerPage> {
    return this.api.get<StockLedgerPage>(`${this.path}/${id}/stock-ledger`, query);
  }

  /** Opening stock or a manual correction (ADMIN). Returns the updated item. */
  stockAdjust(id: string, body: StockAdjustRequest): Observable<Item> {
    return this.api.post<Item>(`${this.path}/${id}/stock-adjust`, body);
  }
}
