import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DeleteResult, ListQuery, PagedResult } from '../models/common.model';
import { ApiService } from './api.service';

/**
 * Base class for REST resources that follow the standard contract:
 * GET /path?page=&limit=&search=&sort=  → { data, total }
 * GET /path/:id, POST /path, PUT /path/:id, DELETE /path/:id → DeleteResult
 */
export abstract class CrudService<T, TSave = Partial<T>, TUpdate = TSave> {
  protected readonly api = inject(ApiService);
  protected abstract readonly path: string;

  list(query: ListQuery = {}): Observable<PagedResult<T>> {
    return this.api.get<PagedResult<T>>(this.path, query);
  }

  /** Convenience for dropdowns: all ACTIVE records, sorted by name. */
  listActive(extra: ListQuery = {}): Observable<PagedResult<T>> {
    return this.list({ status: 'ACTIVE', limit: 1000, sort: 'name', ...extra });
  }

  get(id: string): Observable<T> {
    return this.api.get<T>(`${this.path}/${id}`);
  }

  create(body: TSave): Observable<T> {
    return this.api.post<T>(this.path, body);
  }

  update(id: string, body: TUpdate): Observable<T> {
    return this.api.put<T>(`${this.path}/${id}`, body);
  }

  remove(id: string): Observable<DeleteResult> {
    return this.api.delete<DeleteResult>(`${this.path}/${id}`);
  }
}
