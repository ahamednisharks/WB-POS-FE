import { inject, Injectable, NgZone, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { NotifyService } from './notify.service';

export type DesktopPermission = NotificationPermission | 'unsupported';

export interface DesktopNotice {
  title: string;
  body: string;
  /** Stays on screen until clicked or closed (default true). */
  sticky?: boolean;
  onClick?: () => void;
  /** Closed by the user, or replaced / closed by the browser. */
  onClose?: () => void;
}

/**
 * Windows notifications (bottom-right banner + Action Center) through the browser's Notification API.
 * They show while the browser is minimized or behind other programs, as long as WB-POS is open in a tab.
 * Browsers only allow them on localhost or an https:// address, after the user clicks Allow once.
 */
@Injectable({ providedIn: 'root' })
export class DesktopNotifyService {
  private readonly notify = inject(NotifyService);
  private readonly zone = inject(NgZone);

  readonly supported = typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
  readonly permission = signal<DesktopPermission>(this.supported ? Notification.permission : 'unsupported');
  private readonly icon = new URL(environment.shop.logo, document.baseURI).href;

  constructor() {
    if (!this.supported) return;
    // Follow changes made in the browser's site settings.
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((status) => (status.onchange = () => this.zone.run(() => this.readPermission())))
      .catch(() => undefined);
  }

  /** Header bell / "Turn on" button: asks for permission, explains why it cannot, or sends a test notification. */
  async enable(): Promise<void> {
    if (this.readPermission() === 'default') await this.requestPermission();
    switch (this.permission()) {
      case 'unsupported':
        this.notify.warn('Windows notifications only work when WB-POS is opened on localhost or an https:// address.', 'Not available');
        return;
      case 'denied':
        this.notify.warn(
          'Notifications are blocked for this site. Click the lock icon left of the address bar → Notifications → Allow, then reload the page.',
          'Notifications blocked',
        );
        return;
      case 'default':
        return; // the browser's prompt was closed without choosing
      case 'granted':
        this.show('wbpos-test', {
          title: 'Windows notifications are on',
          body: 'Pre-order delivery alerts will show here even when WB-POS is minimized.',
          sticky: false,
        });
    }
  }

  async requestPermission(): Promise<DesktopPermission> {
    if (!this.supported) return 'unsupported';
    try {
      await Notification.requestPermission();
    } catch {
      // Ignored: the permission is read back below either way.
    }
    return this.readPermission();
  }

  /** Shows (or replaces, same tag) a notification; null when not allowed or the browser refuses. */
  show(tag: string, notice: DesktopNotice): Notification | null {
    if (this.readPermission() !== 'granted') return null;
    try {
      const n = new Notification(notice.title, {
        body: notice.body,
        tag,
        icon: this.icon,
        requireInteraction: notice.sticky ?? true,
        // Play the sound again when a notification with the same tag is shown again (not in TS's lib.dom yet).
        renotify: true,
      } as NotificationOptions);
      n.onclick = () =>
        this.zone.run(() => {
          window.focus();
          notice.onClick?.();
          n.close();
        });
      n.onclose = () => this.zone.run(() => notice.onClose?.());
      return n;
    } catch {
      return null;
    }
  }

  /** WB-POS is the window the user is looking at. */
  appInFront(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  private readPermission(): DesktopPermission {
    const p: DesktopPermission = this.supported ? Notification.permission : 'unsupported';
    this.permission.set(p);
    return p;
  }
}
