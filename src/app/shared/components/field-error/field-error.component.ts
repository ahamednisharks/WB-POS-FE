import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/**
 * Red validation message under a form field. Shows once the control is touched or dirty.
 * `messages` overrides the text per error key (e.g. { pattern: 'Enter 10 digits' }).
 */
@Component({
  selector: 'app-field-error',
  template: `
    @if (message(); as m) {
      <small class="error-text" role="alert">{{ m }}</small>
    }
  `,
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl | null | undefined>();
  readonly label = input('This field');
  readonly messages = input<Record<string, string>>({});

  protected message(): string | null {
    const c = this.control();
    if (!c || !c.errors || !(c.touched || c.dirty)) return null;
    const errors = c.errors as Record<string, unknown>;
    const custom = this.messages();
    const label = this.label();
    const key = Object.keys(errors)[0];
    if (custom[key]) return custom[key];
    const value = errors[key];
    switch (key) {
      case 'required':
        return `${label} is required`;
      case 'minlength':
        return `${label} must be at least ${(value as { requiredLength: number }).requiredLength} characters`;
      case 'maxlength':
        return `${label} must be at most ${(value as { requiredLength: number }).requiredLength} characters`;
      case 'min':
        return `${label} must be at least ${(value as { min: number }).min}`;
      case 'max':
        return `${label} must be at most ${(value as { max: number }).max}`;
      case 'email':
        return 'Enter a valid email address';
      case 'pattern':
        return `${label} is invalid`;
      default:
        return typeof value === 'string' ? value : `${label} is invalid`;
    }
  }
}
