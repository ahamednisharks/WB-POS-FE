import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { PATTERNS } from '../../core/utils/constants';
import { apiErrorMessage } from '../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    IonContent,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    FieldErrorComponent,
  ],
  host: { class: 'ion-page' },
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly shop = environment.shop;
  protected readonly showDemo = environment.useMock;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showForgot = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(PATTERNS.noSpaces)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password, remember } = this.form.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.auth.login({ username: username.trim(), password }, remember).subscribe({
      next: () => {
        this.submitting.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : this.auth.homeUrl());
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err, 'Invalid username or password'));
      },
    });
  }

  protected fillDemo(username: string, password: string): void {
    this.form.patchValue({ username, password });
    this.errorMessage.set(null);
  }
}
