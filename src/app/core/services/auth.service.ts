import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable, tap } from 'rxjs';
import { AuthUser, LoginRequest, LoginResponse, StoredSession } from '../models/auth.model';
import { Role } from '../models/common.model';
import { silentErrors } from '../interceptors/http-context.tokens';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';

const SESSION_KEY = 'wbpos.session';
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;
const SHIFT_MS = 8 * 60 * 60 * 1000;

/** `exp` claim of a JWT in ms, so the local session ends when the server stops accepting the token. */
function tokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = (JSON.parse(atob(part)) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(this.restore());

  readonly user = computed<AuthUser | null>(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly isCashier = computed(() => this.user()?.role === 'CASHIER');

  get token(): string | null {
    const s = this.session();
    if (s && s.expiresAt < Date.now()) {
      this.clear();
      return null;
    }
    return s?.token ?? null;
  }

  login(request: LoginRequest, remember: boolean): Observable<AuthUser> {
    const body: LoginRequest = { ...request, rememberMe: remember };
    return this.api.post<LoginResponse>('/auth/login', body, { context: silentErrors() }).pipe(
      tap((res) => {
        const session: StoredSession = {
          token: res.token,
          user: res.user,
          expiresAt: tokenExpiry(res.token) ?? Date.now() + (remember ? REMEMBER_MS : SHIFT_MS),
        };
        this.storage.set(SESSION_KEY, session);
        this.session.set(session);
      }),
      map((res) => res.user),
    );
  }

  /** Updates fields of the logged-in user in memory and in the stored session. */
  patchUser(patch: Partial<AuthUser>): void {
    const s = this.session();
    if (!s) return;
    const next: StoredSession = { ...s, user: { ...s.user, ...patch } };
    this.storage.set(SESSION_KEY, next);
    this.session.set(next);
  }

  /** Re-reads the theme from the server, so a theme picked on another PC shows up on a remembered session. */
  refreshTheme(): void {
    if (!this.isLoggedIn()) return;
    this.api.get<{ theme?: string } | null>('/auth/me', undefined, { context: silentErrors() }).subscribe({
      next: (me) => {
        if (me?.theme && me.theme !== this.user()?.theme) this.patchUser({ theme: me.theme });
      },
      error: () => undefined,
    });
  }

  logout(navigate = true): void {
    this.clear();
    if (navigate) void this.router.navigateByUrl('/login');
  }

  hasRole(roles: readonly Role[] | undefined): boolean {
    if (!roles || roles.length === 0) return true;
    const role = this.user()?.role;
    return !!role && roles.includes(role);
  }

  /** Landing page after login: ADMIN → dashboard, CASHIER → billing. */
  homeUrl(): string {
    return this.user()?.role === 'ADMIN' ? '/dashboard' : '/billing';
  }

  private clear(): void {
    this.storage.remove(SESSION_KEY);
    this.session.set(null);
  }

  private restore(): StoredSession | null {
    const s = this.storage.get<StoredSession>(SESSION_KEY);
    if (!s || !s.token || !s.user || s.expiresAt < Date.now()) {
      this.storage.remove(SESSION_KEY);
      return null;
    }
    return s;
  }
}
