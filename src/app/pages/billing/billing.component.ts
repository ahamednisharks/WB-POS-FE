import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonModal } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin } from 'rxjs';
import { Bill, Category, Combo, Item } from '../../core/models';
import { BillService } from '../../core/services/bill.service';
import { CategoryService } from '../../core/services/category.service';
import { ComboService } from '../../core/services/combo.service';
import { ItemService } from '../../core/services/item.service';
import { LayoutService } from '../../core/services/layout.service';
import { NotifyService } from '../../core/services/notify.service';
import { PrintService } from '../../core/services/print.service';
import { ShareService } from '../../core/services/share.service';
import { todayIST } from '../../core/utils/date.util';
import { initials } from '../../core/utils/format.util';
import { apiErrorMessage } from '../../core/utils/http-error.util';
import { ConfirmService } from '../../shared/components/confirm-delete/confirm.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { CartPanelComponent } from './cart-panel.component';
import { CartLine, CartStore } from './cart.store';
import { HeldBillsDialogComponent } from './held-bills-dialog.component';
import { PaymentDialogComponent, PaymentResult } from './payment-dialog.component';
import { WeightPadComponent } from './weight-pad.component';

interface CatalogTab {
  id: string;
  label: string;
}

type PadTarget = { kind: 'item'; item: Item } | { kind: 'line'; line: CartLine };

const TILE_COLORS = ['#fff4c2', '#ffe4d6', '#e3f2e1', '#e0ecff', '#f3e5ff', '#ffe0ea', '#e0f7f4'];

@Component({
  selector: 'app-billing',
  imports: [
    IonModal,
    IonContent,
    ButtonModule,
    SkeletonModule,
    TooltipModule,
    EmptyStateComponent,
    CartPanelComponent,
    PaymentDialogComponent,
    WeightPadComponent,
    HeldBillsDialogComponent,
    InrCurrencyPipe,
    QtyPipe,
  ],
  providers: [CartStore],
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent implements OnInit {
  protected readonly cart = inject(CartStore);
  protected readonly layout = inject(LayoutService);
  private readonly itemService = inject(ItemService);
  private readonly categoryService = inject(CategoryService);
  private readonly comboService = inject(ComboService);
  private readonly billService = inject(BillService);
  private readonly print = inject(PrintService);
  private readonly share = inject(ShareService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly barcodeInput = viewChild<ElementRef<HTMLInputElement>>('barcodeInput');

  protected readonly items = signal<Item[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly combos = signal<Combo[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly activeTab = signal('ALL');
  protected readonly saving = signal(false);
  protected readonly heldCount = signal(0);

  protected readonly paymentOpen = signal(false);
  protected readonly heldOpen = signal(false);
  protected readonly cartSheetOpen = signal(false);
  protected readonly padOpen = signal(false);
  protected readonly padTarget = signal<PadTarget | null>(null);

  protected readonly skeletonTiles = Array.from({ length: 12 }, (_, i) => i);

  private readonly colorByCategory = computed(() => {
    const map = new Map<string, string>();
    this.categories().forEach((c, i) => map.set(c.id, TILE_COLORS[i % TILE_COLORS.length]));
    return map;
  });

  protected readonly tabs = computed<CatalogTab[]>(() => {
    const withItems = new Set(this.items().map((i) => i.categoryId));
    const tabs: CatalogTab[] = [{ id: 'ALL', label: 'All' }];
    this.categories()
      .filter((c) => withItems.has(c.id))
      .forEach((c) => tabs.push({ id: c.id, label: c.name }));
    if (this.combos().length) tabs.push({ id: 'COMBOS', label: 'Combos' });
    return tabs;
  });

  protected readonly visibleItems = computed(() => {
    const tab = this.activeTab();
    if (tab === 'COMBOS') return [];
    const q = this.search().trim().toLowerCase();
    return this.items().filter(
      (i) =>
        (tab === 'ALL' || i.categoryId === tab) &&
        (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || i.barcode === q),
    );
  });

  protected readonly visibleCombos = computed(() => {
    const tab = this.activeTab();
    const q = this.search().trim().toLowerCase();
    if (tab !== 'COMBOS' && !(tab === 'ALL' && q)) return [];
    return this.combos().filter((c) => !q || c.name.toLowerCase().includes(q));
  });

  /** refId → qty already in the cart (badge on tiles). */
  protected readonly inCart = computed(() => {
    const map = new Map<string, number>();
    this.cart.lines().forEach((l) => map.set(l.refId, (map.get(l.refId) ?? 0) + l.qty));
    return map;
  });

  protected readonly padTitle = computed(() => {
    const t = this.padTarget();
    if (!t) return '';
    return t.kind === 'item' ? `${t.item.name} — weight` : `${t.line.name} — quantity`;
  });
  protected readonly padUnit = computed(() => {
    const t = this.padTarget();
    return t ? (t.kind === 'item' ? t.item.unitCode : t.line.unitCode) : '';
  });
  protected readonly padDecimal = computed(() => {
    const t = this.padTarget();
    return t ? (t.kind === 'item' ? t.item.allowDecimal : t.line.allowDecimal) : true;
  });
  protected readonly padInitial = computed(() => {
    const t = this.padTarget();
    return t?.kind === 'line' ? t.line.qty : null;
  });

  ngOnInit(): void {
    this.loadCatalog();
    this.refreshHeldCount();
    const resumeId = this.route.snapshot.queryParamMap.get('resume');
    if (resumeId) this.resumeById(resumeId);
  }

  protected loadCatalog(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      items: this.itemService.list({ status: 'ACTIVE', saleable: true, limit: 1000, sort: 'name' }),
      categories: this.categoryService.list({ status: 'ACTIVE', limit: 200, sort: 'displayOrder' }),
      combos: this.comboService.list({ activeOn: todayIST(), limit: 200, sort: 'name' }),
    }).subscribe({
      next: ({ items, categories, combos }) => {
        this.items.set(items.data);
        this.categories.set(categories.data);
        this.combos.set(combos.data);
        this.loading.set(false);
        this.focusSearch();
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected tileColor(categoryId: string): string {
    return this.colorByCategory().get(categoryId) ?? TILE_COLORS[0];
  }

  protected initials(name: string): string {
    return initials(name);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.search.set('');
    const el = this.searchInput()?.nativeElement;
    if (el) el.value = '';
    this.focusSearch();
  }

  /** Enter in the search box adds the only match / exact code match. */
  protected onSearchEnter(): void {
    const q = this.search().trim().toLowerCase();
    if (!q) return;
    const exact = this.items().find((i) => i.code.toLowerCase() === q || i.barcode === q);
    const list = this.visibleItems();
    const target = exact ?? (list.length === 1 ? list[0] : null);
    if (target) {
      this.onItemTap(target);
      this.clearSearch();
    }
  }

  /** Barcode scanners type the code and press Enter. */
  protected onBarcode(event: Event): void {
    const input = event.target as HTMLInputElement;
    const code = input.value.trim();
    input.value = '';
    if (!code) return;
    const item = this.items().find((i) => (i.barcode && i.barcode === code) || i.code.toLowerCase() === code.toLowerCase());
    if (item) this.onItemTap(item);
    else this.notify.warn(`No item found for barcode "${code}"`, 'Not found');
  }

  protected onItemTap(item: Item): void {
    if (item.allowDecimal) {
      this.padTarget.set({ kind: 'item', item });
      this.padOpen.set(true);
      return;
    }
    this.cart.addItem(item, 1);
  }

  protected onComboTap(combo: Combo): void {
    this.cart.addCombo(combo);
  }

  protected onEditQty(line: CartLine): void {
    this.padTarget.set({ kind: 'line', line });
    this.padOpen.set(true);
  }

  protected onPadConfirmed(qty: number): void {
    const t = this.padTarget();
    if (!t) return;
    if (t.kind === 'item') this.cart.addItem(t.item, qty);
    else this.cart.setQty(t.line.lineId, qty);
    this.padTarget.set(null);
  }

  protected openPayment(): void {
    if (!this.cart.canCheckout() || this.saving()) return;
    this.cartSheetOpen.set(false);
    this.paymentOpen.set(true);
  }

  protected hold(): void {
    if (this.cart.isEmpty() || this.saving()) return;
    if (this.cart.discountError() || this.cart.customerError()) {
      this.notify.warn(this.cart.discountError() ?? this.cart.customerError() ?? '');
      return;
    }
    this.saving.set(true);
    this.billService.create(this.cart.toRequest('HELD')).subscribe({
      next: (bill) => {
        this.saving.set(false);
        this.notify.info(`Bill held as ${bill.billNo}`, 'On hold');
        this.cart.clear();
        this.cartSheetOpen.set(false);
        this.refreshHeldCount();
        this.focusSearch();
      },
      error: () => this.saving.set(false),
    });
  }

  protected async clearCart(): Promise<void> {
    if (this.cart.isEmpty()) return;
    const ok = await this.confirm.ask({
      header: 'Clear bill',
      message: 'Remove all items from the current bill?',
      acceptLabel: 'Clear',
      danger: true,
      icon: 'pi pi-trash',
    });
    if (ok) {
      this.cart.clear();
      this.focusSearch();
    }
  }

  protected onPaid(result: PaymentResult): void {
    if (this.saving()) return;
    const wasHeld = !!this.cart.heldBillId();
    this.saving.set(true);
    this.billService
      .create(this.cart.toRequest('COMPLETED', result.payments, result.cashReceived, result.changeReturned))
      .subscribe({
        next: (bill) => {
          this.saving.set(false);
          this.paymentOpen.set(false);
          this.cart.lastBillNo.set(bill.billNo);
          this.notify.success(`Bill ${bill.billNo} saved · ${bill.paymentMode === 'SPLIT' ? 'Split' : bill.paymentMode}`, 'Payment received');
          if (result.action === 'print') this.print.print({ kind: 'receipt', bill, duplicate: false });
          else this.share.shareBill(bill);
          this.cart.clear();
          if (wasHeld) this.refreshHeldCount();
          this.refreshStock(bill);
          this.focusSearch();
        },
        error: () => this.saving.set(false),
      });
  }

  protected async onResume(bill: Bill): Promise<void> {
    if (!this.cart.isEmpty()) {
      const ok = await this.confirm.ask({
        header: 'Replace current bill?',
        message: 'The items in the current bill will be removed. Hold it first if you need it later.',
        acceptLabel: 'Replace',
        icon: 'pi pi-exclamation-triangle',
      });
      if (!ok) return;
    }
    // Held-bill list rows carry no lines — load the full bill first.
    this.billService.get(bill.id).subscribe({
      next: (full) => {
        this.cart.loadHeld(full);
        this.heldOpen.set(false);
        this.notify.info(`Resumed ${full.billNo}`);
      },
    });
  }

  protected refreshHeldCount(): void {
    this.billService.list({ status: 'HELD', limit: 1 }).subscribe({
      next: (res) => this.heldCount.set(res.total),
      error: () => this.heldCount.set(0),
    });
  }

  protected onKey(event: KeyboardEvent): void {
    const busyDialog = this.paymentOpen() || this.padOpen() || this.heldOpen();
    switch (event.key) {
      case 'F2':
        event.preventDefault();
        if (!busyDialog) this.focusSearch(true);
        break;
      case 'F4':
        event.preventDefault();
        if (!busyDialog) this.openPayment();
        break;
      case 'F8':
        event.preventDefault();
        if (!busyDialog) this.hold();
        break;
    }
  }

  private resumeById(id: string): void {
    this.billService.get(id).subscribe({
      next: (bill) => {
        if (bill.status === 'HELD') {
          this.cart.loadHeld(bill);
          this.notify.info(`Resumed ${bill.billNo}`);
        } else {
          this.notify.warn(`${bill.billNo} is not on hold`);
        }
        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      },
    });
  }

  /** Keep stock badges roughly current for bought-and-resold items after a sale. */
  private refreshStock(bill: Bill): void {
    if (!bill.lines.some((l) => this.items().find((i) => i.id === l.refId)?.type === 'BOTH')) return;
    this.itemService.list({ status: 'ACTIVE', saleable: true, limit: 1000, sort: 'name' }).subscribe({
      next: (res) => this.items.set(res.data),
    });
  }

  private focusSearch(force = false): void {
    // Avoid popping the on-screen keyboard on phones unless asked (F2).
    if (this.layout.isMobile() && !force) return;
    setTimeout(() => this.searchInput()?.nativeElement.focus(), 0);
  }

  protected focusBarcode(): void {
    this.barcodeInput()?.nativeElement.focus();
  }
}
