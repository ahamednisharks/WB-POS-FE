import { Component, computed, inject } from '@angular/core';
import { IonButtons, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { AppTitleStrategy } from '../../core/services/title.strategy';
import { initials } from '../../core/utils/format.util';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';

@Component({
  selector: 'app-header',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, ButtonModule, TooltipModule, StatusTagComponent],
  template: `
    <ion-header class="ion-no-border app-header">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button menu="main-menu" aria-label="Open menu" />
        </ion-buttons>
        <div class="bar">
          <h2 class="title">{{ titles.pageTitle() }}</h2>
          @if (user(); as u) {
            <div class="user">
              <div class="avatar" aria-hidden="true">{{ userInitials() }}</div>
              <div class="who">
                <span class="name">{{ u.name }}</span>
                <app-status-tag [status]="u.role" />
              </div>
              <p-button
                icon="pi pi-sign-out"
                [text]="true"
                [rounded]="true"
                severity="secondary"
                pTooltip="Logout"
                tooltipPosition="bottom"
                ariaLabel="Logout"
                (onClick)="logout()"
              />
            </div>
          }
        </div>
      </ion-toolbar>
    </ion-header>
  `,
  styles: `
    .app-header ion-toolbar {
      --min-height: 60px;
      --padding-start: 8px;
      --padding-end: 12px;
      border-bottom: 1px solid var(--border-soft);
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding-left: 0.5rem;
    }
    .title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .user {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--brand);
      color: var(--brand-ink);
      font-weight: 700;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .who {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      line-height: 1.1;
    }
    .name {
      font-weight: 600;
      font-size: 0.88rem;
    }
    @media (max-width: 575px) {
      .who {
        display: none;
      }
      .title {
        font-size: 1rem;
      }
    }
  `,
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  protected readonly titles = inject(AppTitleStrategy);
  protected readonly user = this.auth.user;
  protected readonly userInitials = computed(() => initials(this.user()?.name));

  logout(): void {
    this.auth.logout();
  }
}
