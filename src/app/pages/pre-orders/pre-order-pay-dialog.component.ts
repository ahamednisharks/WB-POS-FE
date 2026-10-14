import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PaymentMode, PreOrder, PreOrderPaymentInput, PreOrderSummary } from '../../core/models';
import { NotifyService } from '../../core/services/notify.service';
import { PreOrderService } from '../../core/services/pre-order.service';
import { PAYMENT_MODE_OPTIONS } from '../../core/utils/constants';
import { formatINR } from '../../core/utils/format.util';
import { round2 } from '../../core/utils/tax.util';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';

type PayRow = FormGroup<{
  mode: FormControl<PaymentMode>;
  amount: FormControl<number | null>;
  reference: FormControl<string>;
  /** Cash handed over (delivery only) — for the change. */
  cashReceived: FormControl<number | null>;
}>;

const MAX_ROWS = 3;

/**
 * PAY: take one more payment before delivery (any amount up to the balance).
 * DELIVER: collect exactly the balance (split across modes if needed), then the bill is generated.
 */
@Component({
  selector: 'app-pre-order-pay-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    FormDialogComponent,
    InrCurrencyPipe,
  ],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="header()" width="620px">
      @if (order(); as o) {
        <div class="pay-summary">
          <div class="kv">
            <span>Order Total</span>
            <span class="num">{{ o.grandTotal | inr }}</span>
          </div>
          <div class="kv">
            <span>Paid So Far</span>
            <span class="num">{{ o.paidAmount | inr }}</span>
          </div>
          <div class="kv grand">
            <span>Balance Due</span>
            <span class="num">{{ o.balance | inr }}</span>
          </div>
        </div>

        @if (isDeliver()) {
          <p-message severity="info" icon="pi pi-info-circle">
            {{ o.balance > 0 ? 'Collect the balance to hand over the order.' : 'The order is fully paid.' }}
            A bill is generated and stock is deducted.
          </p-message>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="pay-rows" formArrayName="rows">
            @for (row of rows.controls; track row; let i = $index) {
              <div class="pay-row" [formGroupName]="i">
                <div class="field">
                  <label [id]="'pay-mode-label-' + i">Mode</label>
                  <p-selectbutton
                    [options]="modes"
                    optionLabel="label"
                    optionValue="value"
                    formControlName="mode"
                    [allowEmpty]="false"
                    [ariaLabelledBy]="'pay-mode-label-' + i"
                  />
                </div>
                <div class="field">
                  <label [for]="'pay-amount-' + i">Amount <span class="req">*</span></label>
                  <p-inputnumber
                    [inputId]="'pay-amount-' + i"
                    formControlName="amount"
                    mode="currency"
                    currency="INR"
                    locale="en-IN"
                    [min]="0"
                    inputStyleClass="w-full"
                  />
                </div>
                @if (row.controls.mode.value !== 'CASH') {
                  <div class="field">
                    <label [for]="'pay-ref-' + i">Reference / UTR</label>
                    <input pInputText [id]="'pay-ref-' + i" formControlName="reference" maxlength="50" placeholder="Optional" />
                  </div>
                } @else if (isDeliver()) {
                  <div class="field">
                    <label [for]="'pay-cash-' + i">Cash Received</label>
                    <p-inputnumber
                      [inputId]="'pay-cash-' + i"
                      formControlName="cashReceived"
                      mode="currency"
                      currency="INR"
                      locale="en-IN"
                      [min]="0"
                      placeholder="Optional"
                      inputStyleClass="w-full"
                    />
                    @if (changes()[i] > 0) {
                      <small class="hint">Return change {{ changes()[i] | inr }}</small>
                    }
                  </div>
                } @else {
                  <div></div>
                }
                <div>
                  @if (rows.length > 1) {
                    <p-button
                      icon="pi pi-times"
                      severity="secondary"
                      [text]="true"
                      [rounded]="true"
                      [ariaLabel]="'Remove payment ' + (i + 1)"
                      (onClick)="removeRow(i)"
                    />
                  }
                </div>
              </div>
            }
          </div>

          @if (rows.length > 0) {
            <div class="kv mt-2">
              @if (rows.length < maxRows) {
                <p-button label="Split payment" icon="pi pi-plus" size="small" [text]="true" (onClick)="addRow()" />
              } @else {
                <span></span>
              }
              <span class="num bold">Entered {{ entered() | inr }}</span>
            </div>
            @if (problem(); as p) {
              <small class="error-text" role="alert">{{ p }}</small>
            }
          }
          <button type="submit" hidden aria-hidden="true"></button>
        </form>
      }

      <div dialogFooter class="dialog-footer">
        <p-button label="Close" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          [label]="isDeliver() ? 'Deliver & Generate Bill' : 'Record Payment'"
          [icon]="isDeliver() ? 'pi pi-check-square' : 'pi pi-wallet'"
          [loading]="saving()"
          [disabled]="!!problem() || form.invalid || saving()"
          (onClick)="submit()"
        />
      </div>
    </app-form-dialog>
  `,
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './pre-order.scss'],
})
export class PreOrderPayDialogComponent {
  readonly visible = model(false);
  readonly order = input<PreOrderSummary | null>(null);
  readonly purpose = input<'PAY' | 'DELIVER'>('PAY');
  readonly done = output<PreOrder>();

  private readonly fb = inject(FormBuilder);
  private readonly preOrders = inject(PreOrderService);
  private readonly notify = inject(NotifyService);

  protected readonly modes = PAYMENT_MODE_OPTIONS;
  protected readonly maxRows = MAX_ROWS;
  protected readonly saving = signal(false);
  protected readonly form = this.fb.nonNullable.group({ rows: new FormArray<PayRow>([]) });
  private readonly value = signal(this.form.getRawValue());

  protected get rows(): FormArray<PayRow> {
    return this.form.controls.rows;
  }

  protected readonly isDeliver = computed(() => this.purpose() === 'DELIVER');
  protected readonly header = computed(() => {
    const no = this.order()?.orderNo ?? '';
    return this.isDeliver() ? `Deliver ${no}` : `Add Payment — ${no}`;
  });
  protected readonly entered = computed(() => round2(this.value().rows.reduce((s, r) => s + (r.amount ?? 0), 0)));
  protected readonly changes = computed(() =>
    this.value().rows.map((r) =>
      r.mode === 'CASH' && r.cashReceived !== null ? round2(r.cashReceived - (r.amount ?? 0)) : 0,
    ),
  );

  /** Why the payment cannot be submitted yet (null = OK). */
  protected readonly problem = computed<string | null>(() => {
    const balance = this.order()?.balance ?? 0;
    const entered = this.entered();
    if (this.changes().some((c) => c < 0)) return 'Cash received cannot be less than the cash amount';
    if (this.isDeliver()) {
      return entered === balance ? null : `Collect exactly the balance of ${formatINR(balance)} (entered ${formatINR(entered)})`;
    }
    if (entered <= 0) return 'Enter the amount received';
    return entered > balance ? `Cannot be more than the balance due of ${formatINR(balance)}` : null;
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    effect(() => {
      if (!this.visible()) return;
      const order = this.order();
      const deliver = this.isDeliver();
      untracked(() => {
        this.saving.set(false);
        this.rows.clear({ emitEvent: false });
        // Delivery of a fully paid order needs no payment rows.
        if (order && (!deliver || order.balance > 0)) {
          this.rows.push(this.newRow(deliver ? order.balance : null), { emitEvent: false });
        }
        this.value.set(this.form.getRawValue());
      });
    });
  }

  private newRow(amount: number | null): PayRow {
    return this.fb.nonNullable.group({
      mode: ['CASH' as PaymentMode],
      amount: [amount, [Validators.required, Validators.min(0.01)]],
      reference: ['', Validators.maxLength(50)],
      cashReceived: [null as number | null, Validators.min(0)],
    });
  }

  /** Split: the new row takes whatever is still to be collected. */
  protected addRow(): void {
    if (this.rows.length >= MAX_ROWS) return;
    const remaining = round2((this.order()?.balance ?? 0) - this.entered());
    this.rows.push(this.newRow(remaining > 0 ? remaining : null));
  }

  protected removeRow(index: number): void {
    if (this.rows.length > 1) this.rows.removeAt(index);
  }

  protected submit(): void {
    const order = this.order();
    if (!order || this.problem() || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const deliver = this.isDeliver();
    const payments: PreOrderPaymentInput[] = this.form
      .getRawValue()
      .rows.filter((r) => (r.amount ?? 0) > 0)
      .map((r) => ({
        mode: r.mode,
        amount: r.amount ?? 0,
        referenceNo: r.mode === 'CASH' ? null : r.reference.trim() || null,
        ...(deliver && r.mode === 'CASH' && r.cashReceived !== null ? { cashReceived: r.cashReceived } : {}),
      }));
    const entered = this.entered();
    this.saving.set(true);
    (deliver ? this.preOrders.deliver(order.id, payments) : this.preOrders.addPayments(order.id, payments)).subscribe({
      next: (updated) => {
        this.saving.set(false);
        if (deliver) this.notify.success(`${updated.orderNo} delivered — bill ${updated.billNo ?? ''} generated`, 'Delivered');
        else this.notify.success(`${formatINR(entered)} received — balance due ${formatINR(updated.balance)}`, 'Payment recorded');
        this.done.emit(updated);
        this.visible.set(false);
      },
      // The error toast comes from the HTTP interceptor; the dialog stays open to correct the amounts.
      error: () => this.saving.set(false),
    });
  }
}
