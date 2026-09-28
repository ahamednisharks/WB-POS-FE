import { Injectable } from '@angular/core';
import { Unit, UnitSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class UnitService extends CrudService<Unit, UnitSave> {
  protected readonly path = '/units';
}
