import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DayClose, DayCloseRequest, ListQuery, TransactionListResult } from '../models';
import { ApiService } from './api.service';

export interface TransactionQuery extends ListQuery {
  from?: string;
  to?: string;
  mode?: string;
  type?: string;
  cashierId?: string;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly api = inject(ApiService);

  list(query: TransactionQuery): Observable<TransactionListResult> {
    return this.api.get<TransactionListResult>('/transactions', query);
  }

  dayClose(body: DayCloseRequest): Observable<DayClose> {
    return this.api.post<DayClose>('/day-close', body);
  }
}
