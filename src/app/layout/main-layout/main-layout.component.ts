import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { IonContent, IonMenu, IonSplitPane } from '@ionic/angular/standalone';
import { filter } from 'rxjs';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

/** ion-split-pane: sidebar always visible ≥ 992px, slide-in drawer below. */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, IonSplitPane, IonMenu, IonContent, SidebarComponent, HeaderComponent],
  template: `
    <ion-split-pane contentId="main-content" when="(min-width: 992px)">
      <ion-menu contentId="main-content" menuId="main-menu" type="overlay" class="app-menu">
        <app-sidebar />
      </ion-menu>
      <div class="ion-page" id="main-content">
        <app-header />
        <ion-content class="main-content" [class.full-bleed]="fullBleed()">
          <div class="outlet" [class.full-bleed]="fullBleed()">
            <router-outlet />
          </div>
        </ion-content>
      </div>
    </ion-split-pane>
  `,
  styles: `
    .app-menu {
      --width: 264px;
      --border: 1px solid var(--border-soft);
    }
    ion-split-pane {
      --side-width: 264px;
      --side-max-width: 264px;
      --border: 1px solid var(--border-soft);
    }
    .main-content {
      --background: var(--surface-page);
    }
    .outlet {
      min-height: 100%;
    }
    .outlet.full-bleed {
      height: 100%;
    }
  `,
})
export class MainLayoutComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly fullBleed = signal(false);

  ngOnInit(): void {
    this.update();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.update());
  }

  private update(): void {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    this.fullBleed.set(r.data['fullBleed'] === true);
  }
}
