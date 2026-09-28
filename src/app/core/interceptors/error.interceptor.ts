import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotifyService } from '../services/notify.service';
import { apiErrorMessage } from '../utils/http-error.util';
import { SKIP_ERROR_TOAST } from './http-context.tokens';

/** Shows a toast for failed API calls; a 401 logs the user out. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotifyService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const isLogin = req.url.endsWith('/auth/login');
        if (err.status === 401 && !isLogin) {
          if (auth.isLoggedIn()) {
            notify.warn('Your session has expired. Please log in again.', 'Signed out');
            auth.logout();
          }
        } else if (!req.context.get(SKIP_ERROR_TOAST)) {
          notify.error(apiErrorMessage(err));
        }
      }
      return throwError(() => err);
    }),
  );
};
