import { Injectable } from '@angular/core';
import { Combo, ComboSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class ComboService extends CrudService<Combo, ComboSave> {
  protected readonly path = '/combos';
}
