import { Injectable } from '@angular/core';
import { SalarySetup, SalarySetupSave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class SalarySetupService extends CrudService<SalarySetup, SalarySetupSave> {
  protected readonly path = '/salary-setups';
}
