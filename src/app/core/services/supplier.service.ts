import { Injectable } from '@angular/core';
import { Supplier, SupplierSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class SupplierService extends CrudService<Supplier, SupplierSave> {
  protected readonly path = '/suppliers';
}
