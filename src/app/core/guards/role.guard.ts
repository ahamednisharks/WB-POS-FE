import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models/common.model';
import { AuthService } from '../services/auth.service';
import { NotifyService } from '../services/notify.service';

/** Reads `data: { roles: ['ADMIN'] }` from the route. */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const roles = route.data['roles'] as Role[] | undefined;
  if (auth.hasRole(roles)) return true;
  inject(NotifyService).warn('You do not have access to that screen.', 'Access denied');
  return inject(Router).parseUrl(auth.homeUrl());
};
