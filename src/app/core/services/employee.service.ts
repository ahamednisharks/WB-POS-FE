import { Injectable } from '@angular/core';
import { Employee, EmployeeSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class EmployeeService extends CrudService<Employee, EmployeeSave> {
  protected readonly path = '/employees';
}
