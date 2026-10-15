import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import {
  CustomerLookup,
  ListQuery,
  PagedResult,
  PreOrder,
  PreOrderCancel,
  PreOrderNextNo,
  PreOrderPaymentInput,
  PreOrderSave,
  PreOrderSummary,
} from '../models';
import { silentErrors } from '../interceptors/http-context.tokens';
import { todayIST } from '../utils/date.util';
import { ApiService } from './api.service';

export interface PreOrderQuery extends ListQuery {
  /** Delivery date range (yyyy-MM-dd). */
  from?: string;
  to?: string;
  /** BOOKED | READY | DELIVERED | CANCELLED | OPEN (booked + ready) */
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class PreOrderService {
  private readonly api = inject(ApiService);
  private readonly path = '/pre-orders';

  list(query: PreOrderQuery): Observable<PagedResult<PreOrderSummary>> {
    return this.api.get<PagedResult<PreOrderSummary>>(this.path, query);
  }

  /** Open (booked / ready) orders to deliver today (IST), soonest first; null when it cannot be loaded. Used by the delivery alerts. */
  dueToday(): Observable<PreOrderSummary[] | null> {
    const today = todayIST();
    return this.api
      .get<PagedResult<PreOrderSummary>>(
        this.path,
        { from: today, to: today, status: 'OPEN', sort: 'deliveryAt', page: 1, limit: 100 },
        { context: silentErrors() },
      )
      .pipe(
        map((res) => res.data),
        catchError(() => of(null)),
      );
  }

  get(id: string): Observable<PreOrder> {
    return this.api.get<PreOrder>(`${this.path}/${id}`);
  }

  /** Number and date for the New Pre-Order screen; null when it cannot be loaded (the form still saves). */
  nextNo(): Observable<PreOrderNextNo | null> {
    return this.api
      .get<PreOrderNextNo>(`${this.path}/next-no`, undefined, { context: silentErrors() })
      .pipe(catchError(() => of(null)));
  }

  create(body: PreOrderSave): Observable<PreOrder> {
    return this.api.post<PreOrder>(this.path, body);
  }

  update(id: string, body: PreOrderSave): Observable<PreOrder> {
    return this.api.put<PreOrder>(`${this.path}/${id}`, body);
  }

  /** Another payment before delivery — the customer may pay any number of times. */
  addPayments(id: string, payments: PreOrderPaymentInput[]): Observable<PreOrder> {
    return this.api.post<PreOrder>(`${this.path}/${id}/payments`, { payments });
  }

  markReady(id: string): Observable<PreOrder> {
    return this.api.post<PreOrder>(`${this.path}/${id}/ready`, {});
  }

  /** Collects the balance (must equal it exactly) and generates the bill. */
  deliver(id: string, payments: PreOrderPaymentInput[]): Observable<PreOrder> {
    return this.api.post<PreOrder>(`${this.path}/${id}/deliver`, { payments });
  }

  /** ADMIN only. */
  cancel(id: string, body: PreOrderCancel): Observable<PreOrder> {
    return this.api.post<PreOrder>(`${this.path}/${id}/cancel`, body);
  }

  /** Returning customer by mobile; null when not found. */
  findCustomer(mobile: string): Observable<CustomerLookup | null> {
    return this.api
      .get<CustomerLookup>(`/customers/by-mobile/${mobile}`, undefined, { context: silentErrors() })
      .pipe(catchError(() => of(null)));
  }
}
