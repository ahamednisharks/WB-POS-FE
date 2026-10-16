import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, StockIssue, StockIssuePage, StockIssueSave } from '../models';
import { CrudService } from './crud.service';

/** Stock issues: raw material sent from the warehouse to production (or written off). */
@Injectable({ providedIn: 'root' })
export class StockIssueService extends CrudService<StockIssue, StockIssueSave> {
  protected readonly path = '/stock-issues';

  override list(query: ListQuery = {}): Observable<StockIssuePage> {
    return this.api.get<StockIssuePage>(this.path, query);
  }

  /** ADMIN only: puts every line back into stock. */
  cancel(id: string, reason: string): Observable<StockIssue> {
    return this.api.post<StockIssue>(`${this.path}/${id}/cancel`, { reason });
  }
}
