import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiErrorBody } from '../models/common.model';

function isApiErrorBody(value: unknown): value is Partial<ApiErrorBody> {
  return typeof value === 'object' && value !== null && 'message' in value;
}

/** Human readable message from any HTTP error (NestJS style `{ message }` bodies supported). */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    const body: unknown = err.error;
    if (isApiErrorBody(body)) {
      const msg = body.message;
      if (Array.isArray(msg)) return msg.join(', ');
      if (typeof msg === 'string' && msg) return msg;
    }
    if (typeof body === 'string' && body) return body;
    return err.statusText && err.statusText !== 'Unknown Error' ? err.statusText : fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Field name the backend blamed (e.g. duplicate name), if any. */
export function apiErrorField(err: unknown): string | null {
  if (err instanceof HttpErrorResponse && isApiErrorBody(err.error) && typeof err.error.field === 'string') {
    return err.error.field;
  }
  return null;
}

/** Puts a `server` error on the form control the backend blamed so it shows under the field. */
export function applyServerError(form: FormGroup, err: unknown): void {
  const field = apiErrorField(err);
  if (!field) return;
  const control: AbstractControl | null = form.get(field);
  if (control) {
    control.setErrors({ ...(control.errors ?? {}), server: apiErrorMessage(err) });
    control.markAsTouched();
  }
}
