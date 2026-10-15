import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { interval, map } from 'rxjs';
import { PreOrderSummary } from '../../core/models';
import { DesktopNotifyService } from '../../core/services/desktop-notify.service';
import { PreOrderAlertService } from '../../core/services/pre-order-alert.service';
import { DELIVERY_TYPE_LABEL, isOverdue } from '../../pages/pre-orders/pre-order.shared';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { IstTimePipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';

/** More than this many orders due today → the rest go into a "+N more" link. */
const MAX_CARDS = 3;

/** Top-right reminder for every open pre-order to deliver today. Closing one brings it back 30 seconds later. */
@Component({
  selector: 'app-pre-order-alerts',
  imports: [ButtonModule, StatusTagComponent, IstTimePipe, InrCurrencyPipe],
  template: `
    @if (alerts.visible().length) {
      <section class="pre-alerts" aria-label="Pre-order delivery alerts">
        @if (askDesktop()) {
          <div class="ask">
            <i class="pi pi-desktop" aria-hidden="true"></i>
            <span class="ask-text">Get these alerts as Windows notifications, even when WB-POS is minimized.</span>
            <p-button label="Turn on" size="small" (onClick)="desktop.enable()" />
            <button type="button" class="close" aria-label="Not now" (click)="askDismissed.set(true)">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </div>
        }
        @for (o of cards(); track o.id) {
          <div class="alert" role="alert" [class.late]="overdue(o)">
            <div class="head">
              <i class="pi pi-bell bell" aria-hidden="true"></i>
              <span class="kicker">{{ overdue(o) ? 'Delivery time passed' : 'Delivery today' }}</span>
              <button type="button" class="close" aria-label="Close (shows again in 30 seconds)" (click)="alerts.close(o.id)">
                <i class="pi pi-times" aria-hidden="true"></i>
              </button>
            </div>
            <p class="msg">Today is delivery for <strong>{{ o.orderNo }}</strong></p>
            <p class="meta">{{ o.deliveryAt | istTime }} · {{ typeLabel[o.deliveryType] }} · {{ o.customerName }}</p>
            @if (o.balance > 0) {
              <p class="meta">Balance due <strong>{{ o.balance | inr }}</strong></p>
            }
            <div class="foot">
              <span class="check">Please check!</span>
              <app-status-tag [status]="o.status" />
              <p-button label="View" icon="pi pi-eye" size="small" (onClick)="view(o)" />
            </div>
          </div>
        }
        @if (more() > 0) {
          <button type="button" class="more" (click)="viewAll()">
            +{{ more() }} more {{ more() === 1 ? 'delivery' : 'deliveries' }} today — view all
          </button>
        }
      </section>
    }
  `,
  styles: `
    .pre-alerts {
      position: fixed;
      top: 72px;
      right: 16px;
      /* Above dialogs (21000+), below dropdown overlays (32000) and toasts (40000). */
      z-index: 30000;
      width: min(340px, calc(100vw - 32px));
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .alert {
      background: var(--surface-card);
      border: 1px solid var(--border-soft);
      border-left: 5px solid var(--brand);
      border-radius: var(--radius);
      box-shadow: var(--shadow-pop);
      padding: 0.7rem 0.85rem 0.75rem;
      animation: alert-in 0.25s ease-out;
    }
    .alert.late {
      border-left-color: var(--danger);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .bell {
      color: var(--brand-icon);
      animation: ring 1.6s ease-in-out infinite;
      transform-origin: 50% 0;
    }
    .late .bell,
    .late .kicker {
      color: var(--danger);
    }
    .kicker {
      flex: 1;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--brand-text);
    }
    .close {
      border: 0;
      background: transparent;
      color: var(--text-muted);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .close:hover {
      background: var(--surface-page);
      color: var(--text-main);
    }
    .msg {
      margin: 0.35rem 0 0.2rem;
      font-size: 0.95rem;
      color: var(--text-main);
    }
    .meta {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    .foot {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.55rem;
    }
    .check {
      flex: 1;
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--text-main);
    }
    .more {
      border: 1px solid var(--border-soft);
      background: var(--brand-softer);
      color: var(--brand-ink-soft);
      border-radius: var(--radius);
      padding: 0.55rem 0.85rem;
      font-weight: 600;
      font-size: 0.85rem;
      text-align: left;
      cursor: pointer;
      box-shadow: var(--shadow-card);
    }
    .more:hover {
      background: var(--brand-soft);
    }
    .ask {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      border: 1px solid var(--border-soft);
      background: var(--brand-softer);
      color: var(--brand-ink-soft);
      border-radius: var(--radius);
      padding: 0.55rem 0.5rem 0.55rem 0.85rem;
      box-shadow: var(--shadow-card);
      animation: alert-in 0.25s ease-out;
    }
    .ask-text {
      flex: 1;
      font-size: 0.82rem;
      line-height: 1.3;
    }
    @keyframes alert-in {
      from {
        opacity: 0;
        transform: translateX(24px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes ring {
      0%,
      60%,
      100% {
        transform: rotate(0);
      }
      10%,
      30%,
      50% {
        transform: rotate(14deg);
      }
      20%,
      40% {
        transform: rotate(-14deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .alert,
      .bell {
        animation: none;
      }
    }
  `,
})
export class PreOrderAlertsComponent implements OnInit, OnDestroy {
  protected readonly alerts = inject(PreOrderAlertService);
  protected readonly desktop = inject(DesktopNotifyService);
  private readonly router = inject(Router);

  /** "Turn on Windows notifications" card: until the browser has been asked, hidden with ✕ until the next sign-in. */
  protected readonly askDismissed = signal(false);
  protected readonly askDesktop = computed(() => this.desktop.permission() === 'default' && !this.askDismissed());

  protected readonly typeLabel: Record<string, string> = DELIVERY_TYPE_LABEL;
  protected readonly cards = computed(() => this.alerts.visible().slice(0, MAX_CARDS));
  protected readonly more = computed(() => Math.max(0, this.alerts.visible().length - MAX_CARDS));
  /** For the "Delivery time passed" look; ticks every 30 seconds. */
  private readonly now = toSignal(interval(30_000).pipe(map(() => Date.now())), { initialValue: Date.now() });

  ngOnInit(): void {
    this.alerts.start();
  }

  ngOnDestroy(): void {
    this.alerts.stop();
  }

  protected overdue(o: PreOrderSummary): boolean {
    return isOverdue(o, this.now());
  }

  /** Opens the order on the Pre-Orders screen; its alert returns in 30 seconds unless it is delivered. */
  protected view(o: PreOrderSummary): void {
    this.alerts.open(o.id);
  }

  protected viewAll(): void {
    void this.router.navigate(['/pre-orders'], { queryParams: { delivery: 'TODAY' } });
  }
}
