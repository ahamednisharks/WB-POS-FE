import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, StockSummaryPage } from '../models';
import { ApiService } from './api.service';

/** Stock register (ADMIN). */
@Injectable({ providedIn: 'root' })
export class StockReportService {
  private readonly api = inject(ApiService);

  /** Filters: from, to (both empty = all time), categoryId, type (RAW | BOTH), lowOnly, search, sort, page, limit. */
  summary(query: ListQuery = {}): Observable<StockSummaryPage> {
    return this.api.get<StockSummaryPage>('/stock/summary', query);
  }
}
