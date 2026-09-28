import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Bill, BillCreate, ListQuery, PagedResult } from '../models';
import { silentErrors } from '../interceptors/http-context.tokens';
import { ApiService } from './api.service';

export interface BillQuery extends ListQuery {
  from?: string;
  to?: string;
  status?: string;
  cashierId?: string;
  paymentMode?: string;
}

@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly api = inject(ApiService);

  create(body: BillCreate): Observable<Bill> {
    return this.api.post<Bill>('/bills', body);
  }

  list(query: BillQuery): Observable<PagedResult<Bill>> {
    return this.api.get<PagedResult<Bill>>('/bills', query);
  }

  get(id: string): Observable<Bill> {
    return this.api.get<Bill>(`/bills/${id}`);
  }

  /** `remarks` is stored after the reason ("reason - remarks"). */
  cancel(id: string, reason: string, remarks?: string | null): Observable<Bill> {
    return this.api.post<Bill>(`/bills/${id}/cancel`, { reason, remarks: remarks || null });
  }

  /** Name of a returning customer, looked up from their latest bill. */
  findCustomerName(mobile: string): Observable<string | null> {
    return this.api
      .get<PagedResult<Bill>>('/bills', { search: mobile, limit: 5, sort: '-billDate' }, { context: silentErrors() })
      .pipe(map((res) => res.data.find((b) => b.customerMobile === mobile && b.customerName)?.customerName ?? null));
  }
}
