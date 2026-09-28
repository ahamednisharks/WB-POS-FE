import { computed, inject, Injectable, signal } from '@angular/core';
import { Bill, BillCreate, BillLineInput, BillPayment, Combo, DiscountType, Item } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PATTERNS } from '../../core/utils/constants';
import { calculateBill, round2, round3 } from '../../core/utils/tax.util';

export interface CartLine extends BillLineInput {
  lineId: string;
}

export const CASHIER_MAX_DISCOUNT_PCT = 10;

let lineSeq = 0;
const nextLineId = () => `L${++lineSeq}`;

/** Billing cart state (provided by the Billing page so the desktop panel and phone sheet share it). */
@Injectable()
export class CartStore {
  private readonly auth = inject(AuthService);

  readonly lines = signal<CartLine[]>([]);
  readonly customerMobile = signal('');
  readonly customerName = signal('');
  readonly discountType = signal<DiscountType>('AMOUNT');
  readonly discountValue = signal(0);
  /** Set while a held bill is resumed. */
  readonly heldBillId = signal<string | null>(null);
  readonly heldBillNo = signal<string | null>(null);
  /** Number of the last saved bill ("Bill No shown after save"). */
  readonly lastBillNo = signal<string | null>(null);

  readonly calc = computed(() => calculateBill(this.lines(), this.discountType(), this.discountValue()));
  readonly isEmpty = computed(() => this.lines().length === 0);
  readonly itemCount = computed(() => this.lines().length);
  readonly grandTotal = computed(() => this.calc().grandTotal);

  /** Validation for the discount box (cashiers are capped at 10 %). */
  readonly discountError = computed<string | null>(() => {
    const value = this.discountValue() || 0;
    if (value <= 0) return null;
    const sub = this.calc().subTotal;
    const type = this.discountType();
    if (type === 'PERCENT' && value > 100) return 'Discount cannot exceed 100%';
    if (type === 'AMOUNT' && value > sub) return 'Discount cannot exceed the sub total';
    if (this.auth.isCashier()) {
      const pct = type === 'PERCENT' ? value : sub > 0 ? (value / sub) * 100 : 0;
      if (pct > CASHIER_MAX_DISCOUNT_PCT + 1e-9) return `Cashier can give at most ${CASHIER_MAX_DISCOUNT_PCT}% discount`;
    }
    return null;
  });

  readonly customerError = computed<string | null>(() => {
    const m = this.customerMobile().trim();
    return m && !PATTERNS.mobile.test(m) ? 'Enter a valid 10-digit mobile number' : null;
  });

  readonly canCheckout = computed(() => !this.isEmpty() && !this.discountError() && !this.customerError());

  addItem(item: Item, qty = 1): void {
    const lines = this.lines();
    const existing = lines.find((l) => l.kind === 'ITEM' && l.refId === item.id);
    if (existing) {
      this.setQty(existing.lineId, existing.qty + qty);
      return;
    }
    this.lines.set([
      ...lines,
      {
        lineId: nextLineId(),
        kind: 'ITEM',
        refId: item.id,
        code: item.code,
        name: item.name,
        unitCode: item.unitCode,
        allowDecimal: item.allowDecimal,
        qty: item.allowDecimal ? round3(qty) : Math.round(qty),
        rate: item.sellingPrice,
        gstPercent: item.gstPercent,
        priceIncludesGst: item.priceIncludesGst,
      },
    ]);
  }

  addCombo(combo: Combo): void {
    const lines = this.lines();
    const existing = lines.find((l) => l.kind === 'COMBO' && l.refId === combo.id);
    if (existing) {
      this.setQty(existing.lineId, existing.qty + 1);
      return;
    }
    this.lines.set([
      ...lines,
      {
        lineId: nextLineId(),
        kind: 'COMBO',
        refId: combo.id,
        code: 'COMBO',
        name: combo.name,
        unitCode: 'PCS',
        allowDecimal: false,
        qty: 1,
        rate: combo.comboPrice,
        gstPercent: combo.gstPercent,
        priceIncludesGst: true,
      },
    ]);
  }

  setQty(lineId: string, qty: number): void {
    const clean = round3(qty);
    if (clean <= 0) {
      this.remove(lineId);
      return;
    }
    this.lines.update((lines) =>
      lines.map((l) => (l.lineId === lineId ? { ...l, qty: l.allowDecimal ? clean : Math.max(1, Math.round(clean)) } : l)),
    );
  }

  step(lineId: string, direction: 1 | -1): void {
    const line = this.lines().find((l) => l.lineId === lineId);
    if (!line) return;
    const step = line.allowDecimal ? 0.25 : 1;
    this.setQty(lineId, line.qty + direction * step);
  }

  remove(lineId: string): void {
    this.lines.update((lines) => lines.filter((l) => l.lineId !== lineId));
  }

  clear(): void {
    this.lines.set([]);
    this.customerMobile.set('');
    this.customerName.set('');
    this.discountType.set('AMOUNT');
    this.discountValue.set(0);
    this.heldBillId.set(null);
    this.heldBillNo.set(null);
  }

  /** Loads a held bill back into the cart. */
  loadHeld(bill: Bill): void {
    this.lines.set(
      bill.lines.map((l) => ({
        lineId: nextLineId(),
        kind: l.kind,
        refId: l.refId,
        code: l.code,
        name: l.name,
        unitCode: l.unitCode,
        allowDecimal: l.allowDecimal,
        qty: l.qty,
        rate: l.rate,
        gstPercent: l.gstPercent,
        priceIncludesGst: l.priceIncludesGst,
      })),
    );
    this.customerMobile.set(bill.customerMobile);
    this.customerName.set(bill.customerName);
    this.discountType.set(bill.discountType);
    this.discountValue.set(bill.discountValue);
    this.heldBillId.set(bill.id);
    this.heldBillNo.set(bill.billNo);
  }

  toRequest(
    status: 'COMPLETED' | 'HELD',
    payments: BillPayment[] = [],
    cashReceived: number | null = null,
    changeReturned: number | null = null,
  ): BillCreate {
    return {
      heldBillId: this.heldBillId(),
      status,
      customerMobile: this.customerMobile().trim(),
      customerName: this.customerName().trim(),
      lines: this.lines().map(({ lineId: _id, ...line }) => line),
      discountType: this.discountType(),
      discountValue: round2(this.discountValue() || 0),
      payments,
      cashReceived,
      changeReturned,
    };
  }
}
