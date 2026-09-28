import { inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Uses each route's `title` for the browser tab and exposes it for the page header. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  readonly pageTitle = signal('');

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const t = this.buildTitle(snapshot) ?? '';
    this.pageTitle.set(t);
    this.title.setTitle(t ? `${t} · WB-POS` : 'WB-POS');
  }
}
