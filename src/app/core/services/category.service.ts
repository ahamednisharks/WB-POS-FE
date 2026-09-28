import { Injectable } from '@angular/core';
import { Category, CategorySave } from '../models';
import { CrudService } from './crud.service';

@Injectable({ providedIn: 'root' })
export class CategoryService extends CrudService<Category, CategorySave> {
  protected readonly path = '/categories';
}
