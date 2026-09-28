import { DATE_PIPE_DEFAULT_OPTIONS, registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEnIn from '@angular/common/locales/en-IN';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { apiEnvelopeInterceptor } from './core/interceptors/api-envelope.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
// Mock backend disabled — the app now talks to the real API (environment.apiUrl).
// import { environment } from '../environments/environment';
// import { mockBackendInterceptor } from './core/mock/mock-backend.interceptor';
import { AppTitleStrategy } from './core/services/title.strategy';
import { BakeryPreset } from './core/theme/bakery-preset';

registerLocaleData(localeEnIn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(
      withInterceptors([
        authInterceptor,
        errorInterceptor,
        apiEnvelopeInterceptor,
        // Mock backend answers every API call when useMock = true (must stay last).
        // ...(environment.useMock ? [mockBackendInterceptor] : []),
      ]),
    ),
    provideIonicAngular({ mode: 'md' }),
    providePrimeNG({
      theme: { preset: BakeryPreset, options: { darkModeSelector: '.app-dark' } },
      ripple: true,
      overlayAppendTo: 'body',
      // Ionic overlays use z-index 20000+; keep PrimeNG dialogs/overlays above them.
      zIndex: { modal: 21000, overlay: 32000, menu: 32000, tooltip: 33000 },
      translation: { dateFormat: 'dd-mm-yy', firstDayOfWeek: 1 },
    }),
    MessageService,
    ConfirmationService,
    { provide: TitleStrategy, useExisting: AppTitleStrategy },
    { provide: LOCALE_ID, useValue: 'en-IN' },
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { dateFormat: 'dd-MM-yyyy', timezone: '+0530' } },
  ],
};
