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
import { TooltipModule } from 'primeng/tooltip';
import { catchError, forkJoin, Observable, of, Subscription } from 'rxjs';
import {
  BankPaymentMode,
  PurchaseEntry,
  PurchaseEntrySave,
  PurchaseOrder,
  PurchaseOrderItem,
  UploadedFile,
} from '../../../core/models';
import { ItemService } from '../../../core/services/item.service';
import { LayoutService } from '../../../core/services/layout.service';
import { NotifyService } from '../../../core/services/notify.service';
import { PurchaseEntryService } from '../../../core/services/purchase-entry.service';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { BANK_PAYMENT_MODE_OPTIONS, GST_OPTIONS } from '../../../core/utils/constants';
import { addDays, dateToStr, displayDate, strToDate, todayIST } from '../../../core/utils/date.util';
import { formatINR } from '../../../core/utils/format.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { calculatePurchase, round2, round3 } from '../../../core/utils/tax.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FilePickerComponent } from '../../../shared/components/file-picker/file-picker.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe, QtyPipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import {
  fallbackItemOption,
  optionsPerRow,
  PurchaseItemOption,
  purchasePaymentStatus,
  sameIds,
  toPurchaseItemOption,
} from '../purchase-order/purchase-form.util';

interface SupplierOption {
  id: string;
  name: string;
  gstin: string;
  state: string;
  isInterState: boolean;
  paymentTermsDays: number;
}

type LineForm = FormGroup<{
  itemId: FormControl<string>;
  /** Pending qty on the PO (read-only); null when not raised against a PO. */
  orderedQty: FormControl<number | null>;
  receivedQty: FormControl<number | null>;
  rate: FormControl<number | null>;
  gstPercent: FormControl<number>;
  expiryDate: FormControl<Date | null>;
}>;

interface LineInit {
  itemId: string;
  orderedQty: number | null;
  receivedQty: number | null;
  rate: number | null;
  gstPercent: number;
  expiryDate: Date | null;
}

interface CalcLine {
  receivedQty: number | null;
  rate: number | null;
  gstPercent: number;
}

function numberOf(control: AbstractControl | null): number {
  return Number(control?.value ?? 0) || 0;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

@Component({
  selector: 'app-pe-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    FieldErrorComponent,
    FilePickerComponent,
    FormDialogComponent,
    StatusTagComponent,
    InrCurrencyPipe,
    IstDatePipe,
    QtyPipe,
  ],
  templateUrl: './pe-form.component.html',
  styleUrl: '../purchase-order/purchase-shared.scss',
})
export class PeFormComponent {
  readonly visible = model(false);
  readonly pe = input<PurchaseEntry | null>(null);
  /** Pre-fill from this PO (Convert to PE). Ignored when editing. */
  readonly fromPo = input<PurchaseOrder | null>(null);
  readonly saved = output<PurchaseEntry>();

  private readonly fb = inject(FormBuilder);
  private readonly entries = inject(PurchaseEntryService);
  private readonly orders = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly itemService = inject(ItemService);
  private readonly notify = inject(NotifyService);
  protected readonly layout = inject(LayoutService);

  protected readonly today = new Date();
  protected readonly modeOptions = BANK_PAYMENT_MODE_OPTIONS;
  protected readonly gstOptions = GST_OPTIONS;

  protected readonly saving = signal(false);
  protected readonly lookupsLoading = signal(false);
  protected readonly posLoading = signal(false);
  protected readonly suppliers = signal<SupplierOption[]>([]);
  protected readonly openPos = signal<PurchaseOrder[]>([]);
  private readonly activeItems = signal<PurchaseItemOption[]>([]);
  /** Items referenced by the entry / PO that may no longer be active. */
  private readonly extraItems = signal<PurchaseItemOption[]>([]);
  private posSub?: Subscription;

  /** Cross-field rules (dates, discount, payment) — same checks the backend makes. */
  private readonly crossValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
    const errors: ValidationErrors = {};
    const peDate = dateToStr(g.get('peDate')?.value as Date | null);
    const invoiceDate = dateToStr(g.get('invoiceDate')?.value as Date | null);
    if (peDate && peDate > todayIST()) errors['peDateFuture'] = true;
    if (peDate && invoiceDate && invoiceDate > peDate) errors['invoiceAfterPe'] = true;

    const lines = (g.get('items')?.value ?? []) as CalcLine[];
    const discount = numberOf(g.get('discount'));
    const calc = calculatePurchase(
      lines.map((l) => ({ qty: l.receivedQty ?? 0, rate: l.rate ?? 0, gstPercent: l.gstPercent })),
      false,
      numberOf(g.get('otherCharges')),
      discount,
    );
    if (discount > 0 && discount > calc.subTotal + calc.totalGst) errors['discountTooHigh'] = true;

    const existing = this.pe();
    if (existing) {
      if (calc.grandTotal + 0.009 < existing.paidAmount) errors['belowPaid'] = true;
    } else {
      const paidNow = numberOf(g.get('paidNow'));
      if (paidNow > calc.grandTotal) errors['paidExceeds'] = true;
      if (paidNow > 0 && !g.get('paymentMode')?.value) errors['modeRequired'] = true;
    }
    return Object.keys(errors).length ? errors : null;
  };

  protected readonly form = this.fb.nonNullable.group(
    {
      peDate: [new Date() as Date | null, Validators.required],
      supplierId: ['', Validators.required],
      poId: [null as string | null],
      invoiceNo: ['', [Validators.required, Validators.maxLength(30)]],
      invoiceDate: [null as Date | null, Validators.required],
      invoiceCopy: [null as UploadedFile | null],
      items: new FormArray<LineForm>([], Validators.minLength(1)),
      discount: [0 as number | null, Validators.min(0)],
      otherCharges: [0 as number | null, Validators.min(0)],
      paidNow: [0 as number | null, Validators.min(0)],
      paymentMode: [null as BankPaymentMode | null],
    },
    { validators: this.crossValidator },
  );

  protected get lines(): FormArray<LineForm> {
    return this.form.controls.items;
  }

  /** Form value as a signal so totals / options update live. */
  private readonly value = signal(this.form.getRawValue());

  protected readonly items = computed(() => {
    const active = this.activeItems();
    const extra = this.extraItems().filter((e) => !active.some((a) => a.id === e.id));
    return [...active, ...extra];
  });
  protected readonly itemMap = computed(() => new Map(this.items().map((i) => [i.id, i])));
  private readonly pickedIds = computed(() => this.value().items.map((l) => l.itemId), { equal: sameIds });
  protected readonly rowOptions = computed(() => optionsPerRow(this.pickedIds(), this.items()));

  protected readonly supplier = computed(() => this.suppliers().find((s) => s.id === this.value().supplierId) ?? null);
  /** Decided by the API against the shop's state in the database. */
  protected readonly interState = computed(() => !!this.supplier()?.isInterState);
  protected readonly selectedPo = computed(() => this.openPos().find((p) => p.id === this.value().poId) ?? null);
  protected readonly poOptions = computed(() =>
    this.openPos().map((p) => ({
      label: `${p.poNo} · ${displayDate(p.poDate)} · ${formatINR(p.grandTotal)}`,
      value: p.id,
    })),
  );

  protected readonly totals = computed(() => {
    const v = this.value();
    return calculatePurchase(
      v.items.map((l) => ({ qty: l.receivedQty ?? 0, rate: l.rate ?? 0, gstPercent: l.gstPercent })),
      this.interState(),
      v.otherCharges ?? 0,
      v.discount ?? 0,
    );
  });
  /** Create: Paid Now. Edit: payments already recorded (read-only). */
  protected readonly paid = computed(() => {
    const existing = this.pe();
    return existing ? existing.paidAmount : (this.value().paidNow ?? 0);
  });
  protected readonly balance = computed(() => round2(Math.max(0, this.totals().grandTotal - this.paid())));
  protected readonly paymentStatus = computed(() => purchasePaymentStatus(this.totals().grandTotal, this.paid()));
  protected readonly dueDate = computed(() => {
    const s = this.supplier();
    const invoiceDate = dateToStr(this.value().invoiceDate);
    return s && invoiceDate ? addDays(invoiceDate, s.paymentTermsDays) : null;
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    // Reset every time the dialog opens: add = blank row, edit = saved values, from PO = pending PO items.
    effect(() => {
      if (!this.visible()) return;
      const pe = this.pe();
      const fromPo = pe ? null : this.fromPo();
      untracked(() => this.open(pe, fromPo));
    });
  }

  private open(pe: PurchaseEntry | null, fromPo: PurchaseOrder | null): void {
    this.posSub?.unsubscribe();
    this.openPos.set([]);
    this.extraItems.set(pe ? pe.items.map(fallbackItemOption) : []);
    this.lines.clear({ emitEvent: false });
    if (pe) {
      pe.items.forEach((i) =>
        this.lines.push(
          this.newLine({
            itemId: i.itemId,
            orderedQty: pe.poId ? i.orderedQty : null,
            receivedQty: i.receivedQty,
            rate: i.rate,
            gstPercent: i.gstPercent,
            expiryDate: strToDate(i.expiryDate),
          }),
          { emitEvent: false },
        ),
      );
    } else if (!fromPo) {
      this.lines.push(this.newLine(), { emitEvent: false });
    }
    this.form.reset({
      peDate: pe ? strToDate(pe.peDate) : new Date(),
      supplierId: pe?.supplierId ?? fromPo?.supplierId ?? '',
      poId: pe?.poId ?? fromPo?.id ?? null,
      invoiceNo: pe?.invoiceNo ?? '',
      invoiceDate: pe ? strToDate(pe.invoiceDate) : null,
      invoiceCopy: pe?.invoiceCopy ?? null,
      discount: pe?.discount ?? 0,
      otherCharges: pe?.otherCharges ?? 0,
      paidNow: 0,
      paymentMode: null,
    });
    // The supplier of a saved entry cannot be changed (the API rejects it).
    if (pe) this.form.controls.supplierId.disable({ emitEvent: false });
    else this.form.controls.supplierId.enable({ emitEvent: false });
    if (fromPo) {
      this.openPos.set([fromPo]);
      this.fillFromPo(fromPo);
    }
    this.loadLookups(pe, fromPo);
    const supplierId = this.form.controls.supplierId.value;
    if (supplierId) this.loadOpenPos(supplierId, fromPo);
  }

  private loadLookups(pe: PurchaseEntry | null, fromPo: PurchaseOrder | null): void {
    this.lookupsLoading.set(true);
    forkJoin({
      suppliers: this.supplierService.listActive(),
      items: this.itemService.listActive({ purchasable: true }),
    }).subscribe({
      next: ({ suppliers, items }) => {
        const options: SupplierOption[] = suppliers.data.map((s) => ({
          id: s.id,
          name: s.name,
          gstin: s.gstin,
          state: s.state,
          isInterState: !!s.isInterState,
          paymentTermsDays: s.paymentTermsDays,
        }));
        // Keep the saved supplier selectable even if it has been made inactive since.
        if (pe && !options.some((s) => s.id === pe.supplierId)) {
          const terms = pe.dueDate ? daysBetween(pe.invoiceDate, pe.dueDate) : 0;
          options.unshift({
            id: pe.supplierId,
            name: pe.supplierName,
            gstin: '',
            state: pe.supplierState,
            isInterState: pe.isInterState,
            paymentTermsDays: terms,
          });
        }
        if (fromPo && !options.some((s) => s.id === fromPo.supplierId)) {
          options.unshift({
            id: fromPo.supplierId,
            name: fromPo.supplierName,
            gstin: fromPo.supplierGstin,
            state: fromPo.supplierState,
            isInterState: fromPo.isInterState,
            paymentTermsDays: 0,
          });
        }
        this.suppliers.set(options);
        this.activeItems.set(items.data.map(toPurchaseItemOption));
        this.lookupsLoading.set(false);
      },
      error: () => this.lookupsLoading.set(false),
    });
  }

  /**
   * Open (Sent / Partially Received) POs of the supplier. Two status requests are used instead of the
   * combined `status=OPEN` filter because the mock's generic status filter runs before its OPEN rule.
   * The PO linked to the entry being edited is included even if it is fully received now.
   */
  private loadOpenPos(supplierId: string, pinned: PurchaseOrder | null = null): void {
    this.posSub?.unsubscribe();
    this.openPos.set(pinned ? [pinned] : []);
    this.posLoading.set(true);
    const existing = this.pe();
    const linkedId = existing && existing.supplierId === supplierId ? existing.poId : null;
    const linked$: Observable<PurchaseOrder | null> = linkedId
      ? this.orders.get(linkedId).pipe(catchError(() => of(null)))
      : of(null);
    this.posSub = forkJoin({
      sent: this.orders.list({ supplierId, status: 'SENT', limit: 100, sort: '-poDate' }),
      partial: this.orders.list({ supplierId, status: 'PARTIAL', limit: 100, sort: '-poDate' }),
      linked: linked$,
    }).subscribe({
      next: ({ sent, partial, linked }) => {
        const list = [...partial.data, ...sent.data];
        for (const extra of [linked, pinned]) {
          if (extra && !list.some((p) => p.id === extra.id)) list.push(extra);
        }
        list.sort((a, b) => (a.poDate === b.poDate ? b.poNo.localeCompare(a.poNo) : b.poDate.localeCompare(a.poDate)));
        this.openPos.set(list);
        this.posLoading.set(false);
      },
      error: () => this.posLoading.set(false),
    });
  }

  private newLine(v?: LineInit): LineForm {
    return this.fb.nonNullable.group({
      itemId: [v?.itemId ?? '', Validators.required],
      orderedQty: [v?.orderedQty ?? null],
      receivedQty: [v?.receivedQty ?? null, [Validators.required, Validators.min(0.001)]],
      rate: [v?.rate ?? null, [Validators.required, Validators.min(0.01)]],
      gstPercent: [v?.gstPercent ?? 0],
      expiryDate: [v?.expiryDate ?? null],
    });
  }

  /** Qty still to be received on a PO line (adds back this entry's own qty when editing it). */
  private pendingQty(po: PurchaseOrder, line: PurchaseOrderItem): number {
    const existing = this.pe();
    const own = existing?.poId === po.id ? (existing.items.find((i) => i.itemId === line.itemId)?.receivedQty ?? 0) : 0;
    return round3(Math.max(0, line.qty - Math.max(0, line.receivedQty - own)));
  }

  /** Replaces the rows with the PO's pending items. */
  private fillFromPo(po: PurchaseOrder): void {
    this.extraItems.update((list) => [
      ...list,
      ...po.items.filter((l) => !list.some((e) => e.id === l.itemId)).map(fallbackItemOption),
    ]);
    this.lines.clear({ emitEvent: false });
    for (const l of po.items) {
      const pending = this.pendingQty(po, l);
      if (pending <= 0) continue;
      this.lines.push(
        this.newLine({
          itemId: l.itemId,
          orderedQty: pending,
          receivedQty: pending,
          rate: l.rate,
          gstPercent: l.gstPercent,
          expiryDate: null,
        }),
        { emitEvent: false },
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.newLine(), { emitEvent: false });
      this.notify.info(`All items of ${po.poNo} have already been received`);
    }
    this.lines.updateValueAndValidity();
  }

  protected onSupplierChange(): void {
    const hadPo = !!this.form.controls.poId.value;
    this.form.controls.poId.setValue(null);
    if (hadPo) {
      // Rows came from the previous supplier's PO — start again.
      this.lines.clear({ emitEvent: false });
      this.lines.push(this.newLine());
    }
    const supplierId = this.form.controls.supplierId.value;
    if (supplierId) this.loadOpenPos(supplierId);
    else this.openPos.set([]);
  }

  protected onPoChange(poId: string | null): void {
    if (!poId) {
      this.lines.controls.forEach((l) => l.controls.orderedQty.setValue(null));
      return;
    }
    const po = this.openPos().find((p) => p.id === poId);
    if (po) this.fillFromPo(po);
  }

  protected addLine(): void {
    this.lines.push(this.newLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  /** Picking an item fills rate / GST from the PO line (if any) or the item's last purchase rate. */
  protected onItemPicked(index: number, itemId: string | null): void {
    const item = itemId ? this.itemMap().get(itemId) : undefined;
    if (!item) return;
    const line = this.lines.at(index);
    const po = this.selectedPo();
    const poLine = po?.items.find((l) => l.itemId === item.id);
    const qty = line.controls.receivedQty.value;
    line.patchValue({
      orderedQty: po && poLine ? this.pendingQty(po, poLine) : null,
      rate: poLine ? poLine.rate : item.purchasePrice > 0 ? item.purchasePrice : line.controls.rate.value,
      gstPercent: poLine ? poLine.gstPercent : item.gstPercent,
      receivedQty: qty !== null && !item.allowDecimal ? Math.round(qty) || null : qty,
    });
  }

  protected payFull(): void {
    this.form.controls.paidNow.setValue(this.totals().grandTotal);
    this.form.controls.paidNow.markAsDirty();
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const existing = this.pe();
    const paidNow = existing ? 0 : (v.paidNow ?? 0);
    const body: PurchaseEntrySave = {
      peDate: dateToStr(v.peDate) ?? '',
      supplierId: v.supplierId,
      poId: v.poId,
      invoiceNo: v.invoiceNo.trim(),
      invoiceDate: dateToStr(v.invoiceDate) ?? '',
      invoiceCopy: v.invoiceCopy,
      items: v.items.map((l) => ({
        itemId: l.itemId,
        orderedQty: v.poId ? l.orderedQty : null,
        receivedQty: l.receivedQty ?? 0,
        rate: l.rate ?? 0,
        gstPercent: l.gstPercent,
        expiryDate: dateToStr(l.expiryDate),
      })),
      discount: v.discount ?? 0,
      otherCharges: v.otherCharges ?? 0,
      paidNow,
      paymentMode: paidNow > 0 ? v.paymentMode : null,
    };
    this.saving.set(true);
    (existing ? this.entries.update(existing.id, body) : this.entries.create(body)).subscribe({
      next: (pe) => {
        this.saving.set(false);
        this.notify.success(
          existing ? `Purchase entry ${pe.peNo} updated — stock adjusted` : `Purchase entry ${pe.peNo} saved — stock added`,
        );
        this.saved.emit(pe);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
