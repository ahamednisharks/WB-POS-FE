import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Viewport breakpoints as signals: phone < 768 ≤ tablet < 992 ≤ desktop. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly isMobile = signal(false);
  readonly isDesktop = signal(true);

  constructor() {
    const mobileQuery = window.matchMedia('(max-width: 767.98px)');
    const desktopQuery = window.matchMedia('(min-width: 992px)');
    const update = () => {
      this.isMobile.set(mobileQuery.matches);
      this.isDesktop.set(desktopQuery.matches);
    };
    update();
    mobileQuery.addEventListener('change', update);
    desktopQuery.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => {
      mobileQuery.removeEventListener('change', update);
      desktopQuery.removeEventListener('change', update);
    });
  }
}
