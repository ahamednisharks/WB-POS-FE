import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, of, switchMap } from 'rxjs';
import { CustomerLookup, DeliveryType, PaymentMode, PreOrder, PreOrderLine, PreOrderSave } from '../../core/models';
import { ItemService } from '../../core/services/item.service';
import { LayoutService } from '../../core/services/layout.service';
import { NotifyService } from '../../core/services/notify.service';
import { PreOrderService } from '../../core/services/pre-order.service';
import { PATTERNS, PAYMENT_MODE_OPTIONS } from '../../core/utils/constants';
import { dateTimeToStr, strToDateTime } from '../../core/utils/date.util';
import { formatINR } from '../../core/utils/format.util';
import { apiErrorField, apiErrorMessage, applyServerError } from '../../core/utils/http-error.util';
import { calculateBill, round2 } from '../../core/utils/tax.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { IstDateTimePipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { DesignPickerComponent } from './design-picker.component';
import { DELIVERY_TYPE_OPTIONS } from './pre-order.shared';

/** An active sale item, or an item already on the order that has since been made inactive. */
interface ItemOption {
  id: string;
  name: string;
  code: string;
  categoryName: string;
  unitCode: string;
  allowDecimal: boolean;
  sellingPrice: number;
  gstPercent: number;
  priceIncludesGst: boolean;
}

type LineForm = FormGroup<{
  itemId: FormControl<string>;
  qty: FormControl<number | null>;
  /** Actual Price — display only: the Item Master price (the booked one for items already on the order). */
  masterRate: FormControl<number | null>;
  /** Item Price — agreed for this order, starts at the Actual Price. */
  rate: FormControl<number | null>;
  notes: FormControl<string>;
  design: FormControl<string | null>;
}>;

const altDiffersFromMobile: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const mobile = String(g.get('customerMobile')?.value ?? '').trim();
  const alt = String(g.get('altMobile')?.value ?? '').trim();
  return alt && alt === mobile ? { altSameAsMobile: true } : null;
};

/**
 * Book / edit a pre-order: customer, delivery date-time and place, items with Actual vs Item Price, per-line notes
 * and design photo, discount, and a payment taken now (advance). More payments can be added later until delivery.
 */
@Component({
  selector: 'app-pre-order-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TextareaModule,
    TooltipModule,
    FieldErrorComponent,
    FormDialogComponent,
    DesignPickerComponent,
    InrCurrencyPipe,
    IstDateTimePipe,
  ],
  templateUrl: './pre-order-form.component.html',
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './pre-order.scss'],
})
export class PreOrderFormComponent {
  readonly visible = model(false);
  /** Full order when editing; null = new booking. */
  readonly order = input<PreOrder | null>(null);
  readonly saved = output<PreOrder>();

  private readonly fb = inject(FormBuilder);
  private readonly preOrders = inject(PreOrderService);
  private readonly itemService = inject(ItemService);
  private readonly notify = inject(NotifyService);
  protected readonly layout = inject(LayoutService);

  protected readonly deliveryTypes = DELIVERY_TYPE_OPTIONS;
  protected readonly paymentModes = PAYMENT_MODE_OPTIONS;
  protected readonly saving = signal(false);
  protected readonly itemsLoading = signal(false);
  protected readonly items = signal<ItemOption[]>([]);
  protected readonly customer = signal<CustomerLookup | null>(null);
  protected readonly minDelivery = signal(new Date());

  /** Delivery time as booked — an overdue order can still be saved as long as it is not moved. */
  private bookedDeliveryAt: number | null = null;
  /** Actual Price of the items already on the order (the server keeps these on edit). */
  private bookedRates = new Map<string, number>();

  private readonly futureDelivery: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
    const d = c.value as Date | null;
    if (!d) return null;
    if (this.bookedDeliveryAt !== null && d.getTime() === this.bookedDeliveryAt) return null;
    return d.getTime() <= Date.now() ? { past: true } : null;
  };

  protected readonly form = this.fb.nonNullable.group(
    {
      customerMobile: ['', [Validators.required, Validators.pattern(PATTERNS.mobile)]],
      customerName: ['', [Validators.required, Validators.maxLength(80)]],
      altMobile: ['', Validators.pattern(PATTERNS.mobile)],
      deliveryAt: [null as Date | null, [Validators.required, this.futureDelivery]],
      deliveryType: ['PICKUP' as DeliveryType],
      deliveryAddress: ['', Validators.maxLength(255)],
      deliveryCharge: [0 as number | null, Validators.min(0)],
      discountAmount: [0 as number | null, Validators.min(0)],
      items: new FormArray<LineForm>([], Validators.minLength(1)),
      payAmount: [0 as number | null, Validators.min(0)],
      payMode: ['CASH' as PaymentMode],
      payReference: ['', Validators.maxLength(50)],
    },
    { validators: altDiffersFromMobile },
  );

  protected get lines(): FormArray<LineForm> {
    return this.form.controls.items;
  }

  /** Form value as a signal so totals update live. */
  protected readonly value = signal(this.form.getRawValue());

  protected readonly itemMap = computed(() => new Map(this.items().map((i) => [i.id, i])));
  protected readonly isHome = computed(() => this.value().deliveryType === 'HOME');

  /** Item Price − Actual Price per line (0 = unchanged). */
  protected readonly rateDiffs = computed(() =>
    this.value().items.map((l) => (l.masterRate === null || l.rate === null ? 0 : round2(l.rate - l.masterRate))),
  );

  /** Same rules as the server (sp_preorder_save): bill tax logic + untaxed delivery charge, rounded to the rupee. */
  protected readonly totals = computed(() => {
    const v = this.value();
    const map = this.itemMap();
    const calc = calculateBill(
      v.items.map((l) => {
        const item = map.get(l.itemId);
        return {
          qty: l.qty ?? 0,
          rate: l.rate ?? 0,
          gstPercent: item?.gstPercent ?? 0,
          priceIncludesGst: item?.priceIncludesGst ?? true,
        };
      }),
      'AMOUNT',
      v.discountAmount ?? 0,
    );
    const deliveryCharge = v.deliveryType === 'HOME' ? (v.deliveryCharge ?? 0) : 0;
    const exact = round2(calc.taxableAmount + calc.totalGst + deliveryCharge);
    const grandTotal = Math.round(exact);
    const paid = this.order()?.paidAmount ?? 0;
    const payNow = v.payAmount ?? 0;
    return {
      ...calc,
      deliveryCharge,
      roundOff: round2(grandTotal - exact),
      grandTotal,
      paid,
      payNow,
      balance: round2(grandTotal - paid - payNow),
    };
  });

  protected readonly discountTooHigh = computed(() => (this.value().discountAmount ?? 0) > this.totals().subTotal);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    // Reset every time the dialog opens (new = one blank row, edit = the order's values).
    effect(() => {
      if (!this.visible()) return;
      const order = this.order();
      untracked(() => this.open(order));
    });

    this.form.controls.deliveryType.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => this.applyDeliveryType(t));

    // Returning customer: show the visit count and fill an empty name.
    this.form.controls.customerMobile.valueChanges
      .pipe(
        debounceTime(300),
        switchMap((m) => (PATTERNS.mobile.test(m.trim()) ? this.preOrders.findCustomer(m.trim()) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((c) => {
        this.customer.set(c);
        const name = this.form.controls.customerName;
        if (c?.name && !name.value.trim()) name.setValue(c.name);
      });
  }

  private open(order: PreOrder | null): void {
    this.saving.set(false);
    this.customer.set(null);
    this.minDelivery.set(new Date());
    this.bookedDeliveryAt = strToDateTime(order?.deliveryAt)?.getTime() ?? null;
    this.bookedRates = new Map();
    for (const l of order?.lines ?? []) if (!this.bookedRates.has(l.itemId)) this.bookedRates.set(l.itemId, l.masterRate);

    this.lines.clear({ emitEvent: false });
    if (order) order.lines.forEach((l) => this.lines.push(this.newLine(l), { emitEvent: false }));
    else this.lines.push(this.newLine(), { emitEvent: false });

    this.form.reset({
      customerMobile: order?.customerMobile ?? '',
      customerName: order?.customerName ?? '',
      altMobile: order?.altMobile ?? '',
      deliveryAt: strToDateTime(order?.deliveryAt),
      deliveryType: order?.deliveryType ?? 'PICKUP',
      deliveryAddress: order?.deliveryAddress ?? '',
      deliveryCharge: order?.deliveryCharge ?? 0,
      discountAmount: order?.discountAmount ?? 0,
      payAmount: 0,
      payMode: 'CASH',
      payReference: '',
    });
    this.applyDeliveryType(this.form.controls.deliveryType.value);
    this.value.set(this.form.getRawValue());
    this.loadItems(order);
  }

  private loadItems(order: PreOrder | null): void {
    this.itemsLoading.set(true);
    this.itemService.listActive({ saleable: true }).subscribe({
      next: (res) => {
        const options: ItemOption[] = res.data.map((i) => ({
          id: i.id,
          name: i.name,
          code: i.code,
          categoryName: i.categoryName,
          unitCode: i.unitCode,
          allowDecimal: i.allowDecimal,
          sellingPrice: i.sellingPrice,
          gstPercent: i.gstPercent,
          priceIncludesGst: i.priceIncludesGst,
        }));
        // An item on the order that has since been made inactive stays selectable.
        for (const l of order?.lines ?? []) {
          if (options.some((o) => o.id === l.itemId)) continue;
          options.push({
            id: l.itemId,
            name: l.itemName,
            code: l.itemCode,
            categoryName: l.categoryName,
            unitCode: l.unitCode,
            allowDecimal: l.allowDecimal,
            sellingPrice: l.masterRate,
            gstPercent: l.gstPercent,
            priceIncludesGst: l.priceIncludesGst,
          });
        }
        this.items.set(options);
        this.itemsLoading.set(false);
      },
      error: () => this.itemsLoading.set(false),
    });
  }

  private newLine(l?: PreOrderLine): LineForm {
    return this.fb.nonNullable.group({
      itemId: [l?.itemId ?? '', Validators.required],
      qty: [(l?.qty ?? 1) as number | null, [Validators.required, Validators.min(0.001)]],
      masterRate: [(l?.masterRate ?? null) as number | null],
      rate: [(l?.rate ?? null) as number | null, [Validators.required, Validators.min(0.01)]],
      notes: [l?.notes ?? '', Validators.maxLength(255)],
      design: [(l?.designUrl ?? null) as string | null],
    });
  }

  /** Home delivery needs an address and may carry a charge; shop pickup has neither. */
  private applyDeliveryType(type: DeliveryType): void {
    const { deliveryAddress, deliveryCharge } = this.form.controls;
    if (type === 'HOME') {
      deliveryAddress.setValidators([Validators.required, Validators.maxLength(255)]);
      deliveryCharge.enable({ emitEvent: false });
    } else {
      deliveryAddress.setValidators(Validators.maxLength(255));
      deliveryCharge.setValue(0, { emitEvent: false });
      deliveryCharge.disable({ emitEvent: false });
    }
    deliveryAddress.updateValueAndValidity({ emitEvent: false });
  }

  protected addLine(): void {
    this.lines.push(this.newLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  /** Picking an item loads its Actual Price (Item Master) and uses it as the Item Price. */
  protected onItemPicked(index: number, itemId: string | null): void {
    const item = itemId ? this.itemMap().get(itemId) : undefined;
    if (!item) return;
    const line = this.lines.at(index);
    const actual = this.bookedRates.get(item.id) ?? item.sellingPrice;
    const qty = line.controls.qty.value;
    line.patchValue({
      masterRate: actual,
      rate: actual,
      qty: qty !== null && !item.allowDecimal ? Math.round(qty) || 1 : qty,
    });
  }

  /** Item Price back to the Actual Price. */
  protected resetRate(index: number): void {
    const line = this.lines.at(index);
    line.controls.rate.setValue(line.controls.masterRate.value);
  }

  protected save(): void {
    if (this.form.invalid || this.saving() || this.discountTooHigh() || this.totals().balance < 0) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const home = v.deliveryType === 'HOME';
    const payNow = v.payAmount ?? 0;
    const body: PreOrderSave = {
      customerMobile: v.customerMobile.trim(),
      customerName: v.customerName.trim(),
      altMobile: v.altMobile.trim() || null,
      deliveryAt: dateTimeToStr(v.deliveryAt) ?? '',
      deliveryType: v.deliveryType,
      deliveryAddress: home ? v.deliveryAddress.trim() : null,
      deliveryCharge: home ? (v.deliveryCharge ?? 0) : 0,
      discountAmount: v.discountAmount ?? 0,
      items: v.items.map((l) => ({
        itemId: l.itemId,
        qty: l.qty ?? 0,
        rate: l.rate ?? 0,
        notes: l.notes.trim() || null,
        design: l.design,
      })),
      payments:
        payNow > 0
          ? [{ mode: v.payMode, amount: payNow, referenceNo: v.payMode === 'CASH' ? null : v.payReference.trim() || null }]
          : [],
    };
    const existing = this.order();
    this.saving.set(true);
    (existing ? this.preOrders.update(existing.id, body) : this.preOrders.create(body)).subscribe({
      next: (o) => {
        this.saving.set(false);
        const paid = payNow > 0 ? ` with ${formatINR(payNow)} received` : '';
        this.notify.success(existing ? `Pre-order ${o.orderNo} updated${paid}` : `Pre-order ${o.orderNo} booked${paid}`);
        this.saved.emit(o);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (apiErrorField(err) === 'payments') {
          const c = this.form.controls.payAmount;
          c.setErrors({ server: apiErrorMessage(err) });
          c.markAsTouched();
        } else {
          applyServerError(this.form, err);
        }
      },
    });
  }
}
