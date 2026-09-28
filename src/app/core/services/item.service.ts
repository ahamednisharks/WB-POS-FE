import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Item, ItemSave } from '../models';
import { nextCode } from '../utils/format.util';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class ItemService extends CrudService<Item, ItemSave> {
  protected readonly path = '/items';

  /** Suggested code for a new item (ITM0001 style, still editable). */
  suggestCode(): Observable<string> {
    return this.list({ page: 1, limit: 1, sort: '-code' }).pipe(map((res) => nextCode('ITM', res.data[0]?.code, 4)));
  }
}
