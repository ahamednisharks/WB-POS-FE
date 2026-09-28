import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Set on requests whose errors are shown inline by the caller (no toast). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export function silentErrors(): HttpContext {
  return new HttpContext().set(SKIP_ERROR_TOAST, true);
}
