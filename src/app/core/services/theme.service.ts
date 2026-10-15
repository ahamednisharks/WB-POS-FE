import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DEFAULT_THEME, isThemeId, ThemeId, themeOption, THEMES } from '../theme/themes';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';

/** Last theme shown on this PC; index.html reads it before the app starts so the page does not flash. */
const THEME_KEY = 'wbpos.theme';

/**
 * Colour theme of the app. Each user's pick is saved on their account and applied when they log in;
 * the login page keeps the last theme used on this PC.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(StorageService);
  private readonly doc = inject(DOCUMENT);

  private readonly current = signal<ThemeId>(this.initial());
  readonly theme = this.current.asReadonly();
  readonly options = THEMES;

  constructor() {
    this.apply(this.current());
    // Login, a restored session and a refreshed profile all arrive through auth.user().
    effect(() => {
      const id = this.auth.user()?.theme;
      if (isThemeId(id)) untracked(() => this.apply(id));
    });
    this.auth.refreshTheme();
  }

  /** Switches to `id` straight away and saves it to the logged-in user; goes back if the save fails. */
  choose(id: ThemeId): void {
    const previous = this.current();
    if (id === previous) return;
    this.apply(id);
    this.auth.patchUser({ theme: id });
    this.api.put<{ theme: string }>('/auth/theme', { theme: id }).subscribe({
      error: () => {
        // The error toast comes from the interceptor; only undo if no newer pick replaced this one.
        if (this.current() !== id) return;
        this.apply(previous);
        this.auth.patchUser({ theme: previous });
      },
    });
  }

  private apply(id: ThemeId): void {
    const option = themeOption(id);
    const root = this.doc.documentElement;
    root.setAttribute('data-theme', id);
    root.classList.toggle('app-dark', option.dark);
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', option.preview.brand);
    this.storage.set(THEME_KEY, id);
    this.current.set(id);
  }

  private initial(): ThemeId {
    const fromUser = this.auth.user()?.theme;
    if (isThemeId(fromUser)) return fromUser;
    const saved = this.storage.get<string>(THEME_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  }
}
