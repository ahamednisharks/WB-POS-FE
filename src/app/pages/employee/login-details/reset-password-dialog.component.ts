import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { LoginAccount } from '../../../core/models';
import { LoginAccountService } from '../../../core/services/login-account.service';
import { NotifyService } from '../../../core/services/notify.service';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { passwordsMatch } from '../employee.shared';

/** Admin sets a new password for a login (new + confirm, min 6). */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [ReactiveFormsModule, ButtonModule, PasswordModule, FieldErrorComponent, FormDialogComponent],
  template: `
    <app-form-dialog [(visible)]="visible" header="Reset Password" width="460px">
      @if (login(); as l) {
        <div class="info-banner">
          <i class="pi pi-key" aria-hidden="true"></i>
          <div>
            Set a new password for <span class="bold">{{ l.username }}</span>
            <span class="muted small">({{ l.employeeName }})</span>. Share it with the employee securely.
          </div>
        </div>
      }
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid mt-2" novalidate autocomplete="off">
        <div class="field span-all">
          <label for="rp-password">New Password <span class="req">*</span></label>
          <p-password
            inputId="rp-password"
            formControlName="password"
            [toggleMask]="true"
            [feedback]="false"
            autocomplete="new-password"
            placeholder="Min 6 characters"
            appendTo="body"
          />
          <app-field-error [control]="form.controls.password" label="Password" />
        </div>
        <div class="field span-all">
          <label for="rp-confirm">Confirm Password <span class="req">*</span></label>
          <p-password
            inputId="rp-confirm"
            formControlName="confirmPassword"
            [toggleMask]="true"
            [feedback]="false"
            autocomplete="new-password"
            placeholder="Re-enter password"
            appendTo="body"
          />
          <app-field-error [control]="form.controls.confirmPassword" label="Confirm password" />
          @if (mismatch) {
            <small class="error-text" role="alert">Passwords do not match</small>
          }
        </div>
        <button type="submit" hidden aria-hidden="true"></button>
      </form>

      <div dialogFooter class="dialog-footer">
        <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Reset Password"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="form.invalid || saving()"
          (onClick)="save()"
        />
      </div>
    </app-form-dialog>
  `,
})
export class ResetPasswordDialogComponent {
  readonly visible = model(false);
  readonly login = input<LoginAccount | null>(null);
  readonly saved = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly logins = inject(LoginAccountService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    effect(() => {
      if (this.visible()) this.form.reset({ password: '', confirmPassword: '' });
    });
  }

  protected get mismatch(): boolean {
    const confirm = this.form.controls.confirmPassword;
    return this.form.hasError('mismatch') && (confirm.touched || confirm.dirty) && !confirm.errors;
  }

  protected save(): void {
    const l = this.login();
    if (!l || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.logins.resetPassword(l.id, this.form.controls.password.value).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.notify.success(res.message || `Password reset for ${l.username}`);
        this.saved.emit();
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
