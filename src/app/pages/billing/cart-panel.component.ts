import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { DiscountType, Option } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BillService } from '../../core/services/bill.service';
import { round2 } from '../../core/utils/tax.util';
import { IstDateTimePipe, QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { CartLine, CartStore } from './cart.store';

/** Right-hand cart: customer, rows with qty steppers, totals and Clear / Hold / Pay. */
@Component({
  selector: 'app-cart-panel',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectButtonModule,
    TooltipModule,
    InrCurrencyPipe,
    QtyPipe,
    IstDateTimePipe,
  ],
  templateUrl: './cart-panel.component.html',
  styleUrl: './cart-panel.component.scss',
})
export class CartPanelComponent {
  protected readonly cart = inject(CartStore);
  protected readonly auth = inject(AuthService);
  private readonly bills = inject(BillService);

  readonly heldCount = input(0);
  readonly saving = input(false);
  readonly compact = input(false);

  readonly pay = output<void>();
  readonly hold = output<void>();
  readonly clearCart = output<void>();
  readonly showHeld = output<void>();
  readonly editQty = output<CartLine>();

  protected readonly now = signal(new Date().toISOString());
  protected readonly lookingUp = signal(false);
  protected readonly discountTypes: Option<DiscountType>[] = [
    { label: '₹', value: 'AMOUNT' },
    { label: '%', value: 'PERCENT' },
  ];

  constructor() {
    const timer = setInterval(() => this.now.set(new Date().toISOString()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected lineAmount(line: CartLine): number {
    return round2(line.qty * line.rate);
  }

  protected onMobileChange(value: string): void {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, 10);
    this.cart.customerMobile.set(digits);
    if (digits.length === 10 && !this.cart.customerName()) {
      this.lookingUp.set(true);
      this.bills.findCustomerName(digits).subscribe({
        next: (name) => {
          this.lookingUp.set(false);
          if (name && !this.cart.customerName() && this.cart.customerMobile() === digits) this.cart.customerName.set(name);
        },
        error: () => this.lookingUp.set(false),
      });
    }
  }

  protected onDiscountType(type: DiscountType | null): void {
    if (type) this.cart.discountType.set(type);
  }

  protected onDiscountValue(value: number | null): void {
    this.cart.discountValue.set(value ?? 0);
  }
}
