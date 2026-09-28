import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { mergeMap, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorBody } from '../models';
import { authRoutes, userFromToken } from './handlers/auth.handlers';
import { employeeModuleRoutes } from './handlers/employee.handlers';
import { masterRoutes } from './handlers/master.handlers';
import { purchaseRoutes } from './handlers/purchase.handlers';
import { salesRoutes } from './handlers/sales.handlers';
import { MockDb } from './mock-db';
import { MockError, MockRoute } from './mock-http';

const ROUTES: MockRoute[] = [...authRoutes, ...masterRoutes, ...employeeModuleRoutes, ...salesRoutes, ...purchaseRoutes];

// Handy while demoing: run `wbposResetMock()` in the browser console to re-seed.
(globalThis as { wbposResetMock?: () => void }).wbposResetMock = () => {
  MockDb.reset();
  location.reload();
};

/**
 * Answers every call to `environment.apiUrl` from the in-browser mock database.
 * Registered only when `environment.useMock === true`.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiUrl.replace(/\/$/, '');
  if (!req.url.startsWith(base)) return next(req);

  const path = req.url.slice(base.length).split('?')[0] || '/';
  const params: Record<string, string> = {};
  for (const key of req.params.keys()) params[key] = req.params.get(key) ?? '';

  return timer(environment.mockDelayMs).pipe(
    mergeMap(() => {
      try {
        const route = ROUTES.find((r) => r.method === req.method && r.pattern.test(path));
        if (!route) throw new MockError(404, `Cannot ${req.method} ${path}`);
        const user = route.auth === false ? null : userFromToken(req.headers.get('Authorization'));
        if (route.auth !== false && !user) throw new MockError(401, 'Unauthorized');
        if (route.roles && user && !route.roles.includes(user.role)) {
          throw new MockError(403, 'You do not have permission to do this.');
        }
        const body = route.handler({
          method: req.method,
          path,
          params,
          body: req.body,
          user,
          match: path.match(route.pattern)!,
        });
        const status = route.status ?? (req.method === 'POST' ? 201 : 200);
        return [new HttpResponse({ status, body, url: req.url })];
      } catch (e) {
        const status = e instanceof MockError ? e.status : 500;
        const error: ApiErrorBody = {
          statusCode: status,
          message: e instanceof Error ? e.message : 'Internal server error',
          ...(e instanceof MockError && e.field ? { field: e.field } : {}),
        };
        if (!(e instanceof MockError)) console.error('[mock] handler crashed', e);
        return throwError(() => new HttpErrorResponse({ status, error, url: req.url, statusText: 'Mock Error' }));
      }
    }),
  );
};
