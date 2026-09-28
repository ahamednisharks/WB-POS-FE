import { Component, computed, effect, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { environment } from '../../../environments/environment';
import { BillPayment, PaymentMode } from '../../core/models';
import { PAYMENT_MODE_OPTIONS } from '../../core/utils/constants';
import { round2 } from '../../core/utils/tax.util';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';

export type PayMode = PaymentMode | 'SPLIT';

export interface PaymentResult {
  payments: BillPayment[];
  cashReceived: number | null;
  changeReturned: number | null;
  action: 'print' | 'share';
}

interface SplitRow {
  mode: PaymentMode;
  amount: number | null;
}

@Component({
  selector: 'app-payment-dialog',
  imports: [FormsModule, ButtonModule, InputNumberModule, InputTextModule, SelectModule, FormDialogComponent, InrCurrencyPipe],
  templateUrl: './payment-dialog.component.html',
  styleUrl: './payment-dialog.component.scss',
})
export class PaymentDialogComponent {
  readonly visible = model(false);
  readonly total = input(0);
  readonly saving = input(false);
  readonly confirmed = output<PaymentResult>();

  protected readonly upiId = environment.shop.upiId;
  protected readonly shopName = environment.shop.name;
  protected readonly quickNotes = [100, 200, 500, 2000];
  protected readonly modeOptions = PAYMENT_MODE_OPTIONS;
  protected readonly modes: { value: PayMode; label: string; icon: string }[] = [
    { value: 'CASH', label: 'Cash', icon: 'pi pi-money-bill' },
    { value: 'UPI', label: 'UPI', icon: 'pi pi-qrcode' },
    { value: 'CARD', label: 'Card', icon: 'pi pi-credit-card' },
    { value: 'SPLIT', label: 'Split', icon: 'pi pi-percentage' },
  ];

  protected readonly mode = signal<PayMode>('CASH');
  protected readonly received = signal<number | null>(null);
  protected readonly upiConfirmed = signal(false);
  protected readonly cardRef = signal('');
  protected readonly splits = signal<SplitRow[]>([]);

  protected readonly change = computed(() => round2((this.received() ?? 0) - this.total()));
  protected readonly splitTotal = computed(() => round2(this.splits().reduce((s, r) => s + (r.amount ?? 0), 0)));
  protected readonly splitRemaining = computed(() => round2(this.total() - this.splitTotal()));

  protected readonly error = computed<string | null>(() => {
    const total = this.total();
    switch (this.mode()) {
      case 'CASH':
        if ((this.received() ?? 0) < total) return 'Amount received must be at least the grand total';
        return null;
      case 'UPI':
        return this.upiConfirmed() ? null : 'Tap "Received" once the UPI payment is confirmed';
      case 'CARD':
        return this.cardRef() && !/^\d{4}$/.test(this.cardRef()) ? 'Enter the last 4 digits of the card' : null;
      case 'SPLIT': {
        const rows = this.splits();
        if (rows.some((r) => (r.amount ?? 0) <= 0)) return 'Each split amount must be greater than 0';
        if (Math.abs(this.splitRemaining()) > 0.009) return `Split total must equal ${formatRs(total)}`;
        return null;
      }
    }
  });

  constructor() {
    // Fresh state every time the dialog opens.
    effect(() => {
      if (!this.visible()) return;
      const total = this.total();
      untracked(() => {
        this.mode.set('CASH');
        this.received.set(total);
        this.upiConfirmed.set(false);
        this.cardRef.set('');
        const half = Math.ceil(total / 2);
        this.splits.set([
          { mode: 'CASH', amount: half },
          { mode: 'UPI', amount: round2(total - half) },
        ]);
      });
    });
  }

  protected selectMode(mode: PayMode): void {
    this.mode.set(mode);
    if (mode === 'CASH' && (this.received() ?? 0) < this.total()) this.received.set(this.total());
  }

  protected setReceived(value: number | null): void {
    this.received.set(value);
  }

  protected quick(note: number): void {
    this.received.set(note);
  }

  protected updateSplit(index: number, patch: Partial<SplitRow>): void {
    this.splits.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected addSplit(): void {
    const remaining = Math.max(0, this.splitRemaining());
    this.splits.update((rows) => [...rows, { mode: 'CARD', amount: remaining || null }]);
  }

  protected removeSplit(index: number): void {
    this.splits.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected fillRemaining(index: number): void {
    const row = this.splits()[index];
    this.updateSplit(index, { amount: round2((row.amount ?? 0) + this.splitRemaining()) });
  }

  protected submit(action: 'print' | 'share'): void {
    if (this.error() || this.saving()) return;
    const total = this.total();
    let payments: BillPayment[];
    let cashReceived: number | null = null;
    let changeReturned: number | null = null;
    switch (this.mode()) {
      case 'CASH':
        payments = [{ mode: 'CASH', amount: total, reference: null }];
        cashReceived = round2(this.received() ?? total);
        changeReturned = this.change();
        break;
      case 'UPI':
        payments = [{ mode: 'UPI', amount: total, reference: null }];
        break;
      case 'CARD':
        payments = [{ mode: 'CARD', amount: total, reference: this.cardRef() || null }];
        break;
      default:
        payments = this.splits().map((r) => ({ mode: r.mode, amount: round2(r.amount ?? 0), reference: null }));
        break;
    }
    this.confirmed.emit({ payments, cashReceived, changeReturned, action });
  }
}

function formatRs(n: number): string {
  return `₹${n.toFixed(2)}`;
}
