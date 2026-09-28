import { Injectable } from '@angular/core';
import { EmployeeType, EmployeeTypeSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class EmployeeTypeService extends CrudService<EmployeeType, EmployeeTypeSave> {
  protected readonly path = '/employee-types';
}
