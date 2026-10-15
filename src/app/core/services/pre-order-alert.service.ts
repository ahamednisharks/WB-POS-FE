import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DELIVERY_TYPE_LABEL, isOverdue } from '../../pages/pre-orders/pre-order.shared';
import { PreOrderSummary } from '../models';
import { displayTime } from '../utils/date.util';
import { formatINR } from '../utils/format.util';
import { DesktopNotifyService } from './desktop-notify.service';
import { PreOrderService } from './pre-order.service';

/** How often the list of today's deliveries is re-read (new bookings, orders delivered at another counter). */
const POLL_MS = 60_000;
/** A closed alert comes back after this long, until the order is delivered or cancelled. */
const SNOOZE_MS = 30_000;

type Timer = ReturnType<typeof setTimeout>;

/**
 * "Delivery today" alerts for pre-orders:
 * - in-app cards, top right (shown by PreOrderAlertsComponent in the main layout);
 * - Windows notifications while WB-POS is not in front (minimized, another program focused), once allowed.
 * Every open order due today keeps alerting; closing one only hides it for 30 seconds.
 */
@Injectable({ providedIn: 'root' })
export class PreOrderAlertService {
  private readonly preOrders = inject(PreOrderService);
  private readonly desktop = inject(DesktopNotifyService);
  private readonly router = inject(Router);

  /** Open orders to deliver today, soonest first. */
  readonly dueToday = signal<PreOrderSummary[]>([]);
  /** Ids whose in-app card was closed in the last 30 seconds. */
  private readonly snoozed = signal<ReadonlySet<string>>(new Set());
  readonly visible = computed(() => this.dueToday().filter((o) => !this.snoozed().has(o.id)));

  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly snoozeTimers = new Map<string, Timer>();
  private sub?: Subscription;

  /** Windows notifications on screen now, by order id. */
  private readonly desktopOpen = new Map<string, Notification>();
  /** Windows notifications closed by the user in the last 30 seconds. */
  private readonly desktopSnooze = new Map<string, Timer>();
  private readonly onWindowChange = () => this.syncDesktop();

  /** Starts polling (main layout opened, i.e. signed in). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), POLL_MS);
    window.addEventListener('focus', this.onWindowChange);
    window.addEventListener('blur', this.onWindowChange);
    document.addEventListener('visibilitychange', this.onWindowChange);
  }

  /** Stops polling and forgets everything (main layout closed, i.e. signed out). */
  stop(): void {
    this.running = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.sub?.unsubscribe();
    window.removeEventListener('focus', this.onWindowChange);
    window.removeEventListener('blur', this.onWindowChange);
    document.removeEventListener('visibilitychange', this.onWindowChange);
    this.snoozeTimers.forEach((t) => clearTimeout(t));
    this.snoozeTimers.clear();
    this.snoozed.set(new Set());
    this.closeAllDesktop();
    this.desktopSnooze.forEach((t) => clearTimeout(t));
    this.desktopSnooze.clear();
    this.dueToday.set([]);
  }

  /** Re-reads today's deliveries now — call after an order is saved, delivered or cancelled. */
  refresh(): void {
    if (!this.running) return;
    this.sub?.unsubscribe();
    this.sub = this.preOrders.dueToday().subscribe((rows) => {
      // Keep the last list when the request fails (offline for a moment).
      if (rows) this.dueToday.set(rows);
      this.syncDesktop();
    });
  }

  /** Hides the in-app card for 30 seconds. */
  close(id: string): void {
    clearTimeout(this.snoozeTimers.get(id));
    this.snoozed.update((s) => new Set(s).add(id));
    this.snoozeTimers.set(
      id,
      setTimeout(() => {
        this.snoozeTimers.delete(id);
        this.snoozed.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }, SNOOZE_MS),
    );
  }

  /** Opens the order on the Pre-Orders screen; its card returns in 30 seconds unless it is delivered. */
  open(id: string): void {
    this.close(id);
    void this.router.navigate(['/pre-orders'], { queryParams: { view: id } });
  }

  /** Shows a Windows notification for every due order while WB-POS is not in front; closes them all when it is. */
  private syncDesktop(): void {
    if (!this.running || this.desktop.permission() !== 'granted' || this.desktop.appInFront()) {
      this.closeAllDesktop();
      return;
    }
    const due = new Map(this.dueToday().map((o) => [o.id, o]));
    for (const id of [...this.desktopOpen.keys()]) {
      if (!due.has(id)) this.closeDesktop(id);
    }
    for (const o of due.values()) {
      if (this.desktopOpen.has(o.id) || this.desktopSnooze.has(o.id)) continue;
      const n = this.desktop.show(`preorder-${o.id}`, {
        ...this.desktopText(o),
        onClick: () => {
          this.desktopOpen.delete(o.id);
          this.snoozeDesktop(o.id);
          this.open(o.id);
        },
        onClose: () => {
          // Still in the map = the user closed it (closing from code removes it first).
          if (this.desktopOpen.get(o.id) !== n) return;
          this.desktopOpen.delete(o.id);
          this.snoozeDesktop(o.id);
        },
      });
      if (n) this.desktopOpen.set(o.id, n);
    }
  }

  private desktopText(o: PreOrderSummary): { title: string; body: string } {
    const details = [displayTime(o.deliveryAt), DELIVERY_TYPE_LABEL[o.deliveryType], o.customerName];
    if (o.balance > 0) details.push(`Balance ${formatINR(o.balance)}`);
    return {
      title: `${isOverdue(o) ? 'Delivery time passed' : 'Delivery today'}: ${o.orderNo}`,
      body: `Today is delivery for ${o.orderNo}. Please check!\n${details.join(' · ')}`,
    };
  }

  private snoozeDesktop(id: string): void {
    clearTimeout(this.desktopSnooze.get(id));
    this.desktopSnooze.set(
      id,
      setTimeout(() => {
        this.desktopSnooze.delete(id);
        this.syncDesktop();
      }, SNOOZE_MS),
    );
  }

  private closeDesktop(id: string): void {
    const n = this.desktopOpen.get(id);
    this.desktopOpen.delete(id);
    n?.close();
  }

  private closeAllDesktop(): void {
    for (const id of [...this.desktopOpen.keys()]) this.closeDesktop(id);
  }
}
