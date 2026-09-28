import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  context?: HttpContext;
}

/** Thin HttpClient wrapper: prefixes `environment.apiUrl` and drops empty query params. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl.replace(/\/$/, '');

  get<T>(path: string, params?: QueryParams, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toParams(params), context: options?.context });
  }

  post<T>(path: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(this.url(path), body, { context: options?.context });
  }

  put<T>(path: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.put<T>(this.url(path), body, { context: options?.context });
  }

  patch<T>(path: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { context: options?.context });
  }

  delete<T>(path: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), { context: options?.context });
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private toParams(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (!params) return httpParams;
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === '') continue;
      httpParams = httpParams.set(key, String(value));
    }
    return httpParams;
  }
}
