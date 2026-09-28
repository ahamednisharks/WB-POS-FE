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
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin } from 'rxjs';
import { PurchaseOrder, PurchaseOrderItem, PurchaseOrderSave } from '../../../core/models';
import { ItemService } from '../../../core/services/item.service';
import { LayoutService } from '../../../core/services/layout.service';
import { NotifyService } from '../../../core/services/notify.service';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { dateToStr, strToDate } from '../../../core/utils/date.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { calculatePurchase } from '../../../core/utils/tax.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { optionsPerRow, PurchaseItemOption, sameIds, toPurchaseItemOption, withFallbackItems } from './purchase-form.util';

interface SupplierOption {
  id: string;
  name: string;
  gstin: string;
  state: string;
  isInterState: boolean;
}

type LineForm = FormGroup<{
  itemId: FormControl<string>;
  qty: FormControl<number | null>;
  rate: FormControl<number | null>;
  gstPercent: FormControl<number>;
}>;

/** Expected delivery date must not be before the PO date. */
const expectedAfterPoDate: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const poDate = dateToStr(g.get('poDate')?.value as Date | null);
  const expected = dateToStr(g.get('expectedDate')?.value as Date | null);
  return poDate && expected && expected < poDate ? { expectedBeforePo: true } : null;
};

@Component({
  selector: 'app-po-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    SelectModule,
    TextareaModule,
    TooltipModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
  ],
  templateUrl: './po-form.component.html',
  styleUrl: './purchase-shared.scss',
})
export class PoFormComponent {
  readonly visible = model(false);
  readonly po = input<PurchaseOrder | null>(null);
  readonly saved = output<PurchaseOrder>();

  private readonly fb = inject(FormBuilder);
  private readonly orders = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly itemService = inject(ItemService);
  private readonly notify = inject(NotifyService);
  protected readonly layout = inject(LayoutService);

  protected readonly savingAs = signal<'DRAFT' | 'SENT' | null>(null);
  protected readonly lookupsLoading = signal(false);
  protected readonly suppliers = signal<SupplierOption[]>([]);
  private readonly items = signal<PurchaseItemOption[]>([]);

  protected readonly form = this.fb.nonNullable.group(
    {
      poDate: [new Date() as Date | null, Validators.required],
      supplierId: ['', Validators.required],
      expectedDate: [null as Date | null],
      notes: ['', Validators.maxLength(500)],
      otherCharges: [0 as number | null, Validators.min(0)],
      items: new FormArray<LineForm>([], Validators.minLength(1)),
    },
    { validators: expectedAfterPoDate },
  );

  protected get lines(): FormArray<LineForm> {
    return this.form.controls.items;
  }

  /** Form value as a signal so totals / item options update live. */
  private readonly value = signal(this.form.getRawValue());

  protected readonly supplier = computed(() => this.suppliers().find((s) => s.id === this.value().supplierId) ?? null);
  /** Decided by the API against the shop's state in the database. */
  protected readonly interState = computed(() => !!this.supplier()?.isInterState);
  protected readonly itemMap = computed(() => new Map(this.items().map((i) => [i.id, i])));
  private readonly pickedIds = computed(() => this.value().items.map((l) => l.itemId), { equal: sameIds });
  protected readonly rowOptions = computed(() => optionsPerRow(this.pickedIds(), this.items()));
  protected readonly totals = computed(() => {
    const v = this.value();
    return calculatePurchase(
      v.items.map((l) => ({ qty: l.qty ?? 0, rate: l.rate ?? 0, gstPercent: l.gstPercent })),
      this.interState(),
      v.otherCharges ?? 0,
    );
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    // Reset the form every time the dialog opens (add = one blank row, edit = the draft's values).
    effect(() => {
      if (!this.visible()) return;
      const po = this.po();
      untracked(() => this.open(po));
    });
  }

  private open(po: PurchaseOrder | null): void {
    this.lines.clear({ emitEvent: false });
    if (po) po.items.forEach((i) => this.lines.push(this.newLine(i), { emitEvent: false }));
    else this.lines.push(this.newLine(), { emitEvent: false });
    this.form.reset({
      poDate: po ? strToDate(po.poDate) : new Date(),
      supplierId: po?.supplierId ?? '',
      expectedDate: strToDate(po?.expectedDate),
      notes: po?.notes ?? '',
      otherCharges: po?.otherCharges ?? 0,
    });
    this.loadLookups(po);
  }

  private loadLookups(po: PurchaseOrder | null): void {
    this.lookupsLoading.set(true);
    forkJoin({
      suppliers: this.supplierService.listActive(),
      items: this.itemService.listActive({ purchasable: true }),
    }).subscribe({
      next: ({ suppliers, items }) => {
        const supplierOptions: SupplierOption[] = suppliers.data.map((s) => ({
          id: s.id,
          name: s.name,
          gstin: s.gstin,
          state: s.state,
          isInterState: !!s.isInterState,
        }));
        // A draft may reference a supplier / item that has since been made inactive — keep it selectable.
        if (po && !supplierOptions.some((s) => s.id === po.supplierId)) {
          supplierOptions.unshift({
            id: po.supplierId,
            name: po.supplierName,
            gstin: po.supplierGstin,
            state: po.supplierState,
            isInterState: po.isInterState,
          });
        }
        this.suppliers.set(supplierOptions);
        this.items.set(withFallbackItems(items.data.map(toPurchaseItemOption), po?.items ?? []));
        this.lookupsLoading.set(false);
      },
      error: () => this.lookupsLoading.set(false),
    });
  }

  private newLine(i?: PurchaseOrderItem): LineForm {
    return this.fb.nonNullable.group({
      itemId: [i?.itemId ?? '', Validators.required],
      qty: [(i?.qty ?? null) as number | null, [Validators.required, Validators.min(0.001)]],
      rate: [(i?.rate ?? null) as number | null, [Validators.required, Validators.min(0.01)]],
      gstPercent: [i?.gstPercent ?? 0],
    });
  }

  protected addLine(): void {
    this.lines.push(this.newLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  /** Picking an item fills its last purchase rate and GST %. */
  protected onItemPicked(index: number, itemId: string | null): void {
    const item = itemId ? this.itemMap().get(itemId) : undefined;
    if (!item) return;
    const line = this.lines.at(index);
    const qty = line.controls.qty.value;
    line.patchValue({
      rate: item.purchasePrice > 0 ? item.purchasePrice : line.controls.rate.value,
      gstPercent: item.gstPercent,
      qty: qty !== null && !item.allowDecimal ? Math.round(qty) || null : qty,
    });
  }

  protected save(status: 'DRAFT' | 'SENT'): void {
    if (this.form.invalid || this.savingAs()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: PurchaseOrderSave = {
      poDate: dateToStr(v.poDate) ?? '',
      supplierId: v.supplierId,
      expectedDate: dateToStr(v.expectedDate),
      notes: v.notes.trim(),
      items: v.items.map((l) => ({ itemId: l.itemId, qty: l.qty ?? 0, rate: l.rate ?? 0, gstPercent: l.gstPercent })),
      otherCharges: v.otherCharges ?? 0,
      status,
    };
    const existing = this.po();
    this.savingAs.set(status);
    (existing ? this.orders.update(existing.id, body) : this.orders.create(body)).subscribe({
      next: (po) => {
        this.savingAs.set(null);
        this.notify.success(
          status === 'SENT' ? `Purchase order ${po.poNo} saved and marked as sent` : `Purchase order ${po.poNo} saved as draft`,
        );
        this.saved.emit(po);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.savingAs.set(null);
        applyServerError(this.form, err);
      },
    });
  }
}
