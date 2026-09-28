import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Blocks every route except /login when not logged in. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn() && auth.token) return true;
  return inject(Router).createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
  });
};

/** Keeps logged-in users away from /login. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};
