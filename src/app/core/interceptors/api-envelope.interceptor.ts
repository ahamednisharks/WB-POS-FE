import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';

interface SuccessEnvelope {
  success: true;
  message?: string;
  data: unknown;
  total?: number;
  [extra: string]: unknown;
}

function isEnvelope(body: unknown): body is SuccessEnvelope {
  return typeof body === 'object' && body !== null && (body as { success?: unknown }).success === true && 'data' in body;
}

/**
 * The API wraps every success as `{ success, message?, data }` or, for lists, `{ success, data, total, ...extra }`.
 * Services work with the bare payload, so unwrap it here:
 *   list   → `{ data, total, ...extra }` (PagedResult plus any summary fields)
 *   single → `data` (or `{ message }` when the endpoint returns no data)
 * Files (Blob) and non-API URLs pass through untouched.
 */
export const apiEnvelopeInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiUrl.replace(/\/$/, '');
  if (!req.url.startsWith(base)) return next(req);

  return next(req).pipe(
    map((event) => {
      if (!(event instanceof HttpResponse) || !isEnvelope(event.body)) return event;
      const { success: _success, message, data, ...rest } = event.body;
      if (rest['total'] !== undefined) return event.clone({ body: { data, ...rest } });
      if ((data === null || data === undefined) && message) return event.clone({ body: { message } });
      return event.clone({ body: data });
    }),
  );
};
