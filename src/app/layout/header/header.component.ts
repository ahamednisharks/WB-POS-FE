import { Component, computed, inject } from '@angular/core';
import { IonButtons, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { PopoverModule } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { DesktopNotifyService, DesktopPermission } from '../../core/services/desktop-notify.service';
import { ThemeService } from '../../core/services/theme.service';
import { AppTitleStrategy } from '../../core/services/title.strategy';
import { initials } from '../../core/utils/format.util';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';

/** Tooltip of the Windows-notifications bell. */
const BELL_LABEL: Record<DesktopPermission, string> = {
  granted: 'Windows notifications are on (click to test)',
  default: 'Turn on Windows notifications',
  denied: 'Windows notifications are blocked',
  unsupported: 'Windows notifications are not available',
};

@Component({
  selector: 'app-header',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, ButtonModule, PopoverModule, TooltipModule, StatusTagComponent],
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
              <p-button
                [icon]="desktop.permission() === 'granted' ? 'pi pi-bell' : 'pi pi-bell-slash'"
                [text]="true"
                [rounded]="true"
                severity="secondary"
                [pTooltip]="bellLabel()"
                tooltipPosition="bottom"
                [ariaLabel]="bellLabel()"
                (onClick)="desktop.enable()"
              />
              <p-button
                icon="pi pi-palette"
                [text]="true"
                [rounded]="true"
                severity="secondary"
                pTooltip="Change theme"
                tooltipPosition="bottom"
                ariaLabel="Change theme"
                (onClick)="themePicker.toggle($event)"
              />
              <p-popover #themePicker>
                <div class="theme-picker">
                  <div class="picker-title" id="theme-picker-title">Theme</div>
                  <div class="theme-grid" role="radiogroup" aria-labelledby="theme-picker-title">
                    @for (t of themes.options; track t.id) {
                      <button
                        type="button"
                        class="theme-option"
                        role="radio"
                        [class.selected]="t.id === themes.theme()"
                        [attr.aria-checked]="t.id === themes.theme()"
                        (click)="themes.choose(t.id)"
                      >
                        <span class="preview" [style.background]="t.preview.page" aria-hidden="true">
                          <span class="pv-side" [style.background]="t.preview.sidebar"></span>
                          <span class="pv-main">
                            <span class="pv-bar" [style.background]="t.preview.brand"></span>
                            <span class="pv-card" [style.background]="t.preview.card">
                              <span class="pv-dot" [style.background]="t.preview.brand"></span>
                              <span class="pv-dot" [style.background]="t.preview.accent"></span>
                            </span>
                          </span>
                        </span>
                        <span class="theme-name">
                          {{ t.name }}
                          @if (t.id === themes.theme()) {
                            <i class="pi pi-check" aria-hidden="true"></i>
                          }
                        </span>
                      </button>
                    }
                  </div>
                  <p class="picker-note">Saved to your login only.</p>
                </div>
              </p-popover>
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
    .theme-picker {
      width: 296px;
    }
    .picker-title {
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 0.6rem;
    }
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.6rem;
    }
    .theme-option {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: 0.4rem;
      border: 2px solid var(--border-soft);
      border-radius: 10px;
      background: var(--surface-card);
      color: var(--text-main);
      font: inherit;
      cursor: pointer;
      text-align: left;
    }
    .theme-option:hover {
      border-color: var(--brand-border);
    }
    .theme-option.selected {
      border-color: var(--brand);
    }
    .theme-option:focus-visible {
      outline: 2px solid var(--brand-icon);
      outline-offset: 2px;
    }
    .preview {
      display: flex;
      height: 58px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.08);
    }
    .pv-side {
      width: 26%;
    }
    .pv-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 6px;
    }
    .pv-bar {
      width: 45%;
      height: 7px;
      border-radius: 4px;
    }
    .pv-card {
      flex: 1;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding: 5px;
      border-radius: 4px;
    }
    .pv-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .theme-name {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .theme-name .pi {
      font-size: 0.75rem;
      color: var(--brand-text);
    }
    .picker-note {
      margin: 0.6rem 0 0;
      font-size: 0.75rem;
      color: var(--text-muted);
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
  protected readonly desktop = inject(DesktopNotifyService);
  protected readonly bellLabel = computed(() => BELL_LABEL[this.desktop.permission()]);
  protected readonly themes = inject(ThemeService);

  logout(): void {
    this.auth.logout();
  }
}
