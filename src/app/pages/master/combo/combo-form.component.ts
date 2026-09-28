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
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription } from 'rxjs';
import { Combo, ComboSave, GstRate, Option, Status } from '../../../core/models';
import { ComboService } from '../../../core/services/combo.service';
import { ItemService } from '../../../core/services/item.service';
import { NotifyService } from '../../../core/services/notify.service';
import { GST_OPTIONS, STATUS_OPTIONS } from '../../../core/utils/constants';
import { dateToStr, strToDate } from '../../../core/utils/date.util';
import { formatINR } from '../../../core/utils/format.util';
import { applyServerError } from '../../../core/utils/http-error.util';
import { round2 } from '../../../core/utils/tax.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { ImagePickerComponent } from '../../../shared/components/image-picker/image-picker.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

/** Saleable item offered in the combo item dropdown. */
interface ComboItemOption extends Option {
  name: string;
  price: number;
  gst: GstRate;
  allowDecimal: boolean;
}

type ComboRow = FormGroup<{
  itemId: FormControl<string | null>;
  qty: FormControl<number | null>;
}>;

interface ComboLine {
  option: ComboItemOption | null;
  amount: number;
}

const MIN_ROWS = 2;

function minRows(control: AbstractControl): ValidationErrors | null {
  return control instanceof FormArray && control.length < MIN_ROWS ? { minRows: true } : null;
}

function uniqueItems(control: AbstractControl): ValidationErrors | null {
  if (!(control instanceof FormArray)) return null;
  const ids = (control.getRawValue() as { itemId: string | null }[]).map((r) => r.itemId).filter((id) => !!id);
  return new Set(ids).size !== ids.length ? { duplicate: true } : null;
}

function sameIds(a: (string | null)[], b: (string | null)[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

@Component({
  selector: 'app-combo-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    DatePickerModule,
    TooltipModule,
    FieldErrorComponent,
    FormDialogComponent,
    ImagePickerComponent,
    InrCurrencyPipe,
  ],
  templateUrl: './combo-form.component.html',
  styleUrl: './combo-form.component.scss',
})
export class ComboFormComponent {
  readonly visible = model(false);
  readonly combo = input<Combo | null>(null);
  readonly saved = output<Combo>();

  private readonly fb = inject(FormBuilder);
  private readonly combos = inject(ComboService);
  private readonly items = inject(ItemService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly loadingOptions = signal(false);
  protected readonly itemOptions = signal<ComboItemOption[]>([]);
  protected readonly gstOptions = GST_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;

  /** True once the user picked a GST % themselves; until then it follows the highest item GST. */
  protected readonly gstManual = signal(false);
  private optionsSub?: Subscription;

  protected readonly rows = new FormArray<ComboRow>([], [minRows, uniqueItems]);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    items: this.rows,
    comboPrice: [null as number | null, Validators.required],
    gstPercent: [null as GstRate | null],
    validFrom: [null as Date | null],
    validTo: [null as Date | null],
    image: [null as string | null],
    status: ['ACTIVE' as Status, Validators.required],
  });

  /** Latest form value as a signal (drives the live totals). */
  private readonly value = signal(this.form.getRawValue());

  private readonly itemMap = computed(() => new Map(this.itemOptions().map((o) => [o.value, o])));

  private readonly selectedIds = computed(() => this.value().items.map((r) => r.itemId), { equal: sameIds });

  /** Per-row dropdown options: an item already picked in another row is hidden. */
  private readonly rowOptions = computed(() => {
    const selected = this.selectedIds();
    const all = this.itemOptions();
    return selected.map((id, i) => all.filter((o) => o.value === id || !selected.some((s, j) => j !== i && s === o.value)));
  });

  private readonly lines = computed<ComboLine[]>(() => {
    const map = this.itemMap();
    return this.value().items.map((r) => {
      const option = r.itemId ? (map.get(r.itemId) ?? null) : null;
      return { option, amount: option ? round2(option.price * (r.qty ?? 0)) : 0 };
    });
  });

  protected readonly actualPrice = computed(() => round2(this.lines().reduce((s, l) => s + l.amount, 0)));

  protected readonly savings = computed(() => {
    const price = this.value().comboPrice ?? 0;
    const actual = this.actualPrice();
    return price > 0 && price < actual ? round2(actual - price) : 0;
  });

  protected readonly savingsPercent = computed(() => {
    const actual = this.actualPrice();
    return actual > 0 ? Math.round((this.savings() / actual) * 100) : 0;
  });

  protected readonly highestGst = computed<GstRate | null>(() => {
    const rates = this.lines()
      .filter((l) => !!l.option)
      .map((l) => l.option?.gst ?? 0);
    return rates.length ? (Math.max(...rates) as GstRate) : null;
  });

  protected readonly validFrom = computed(() => this.value().validFrom);

  protected readonly comboPriceMessages = computed(() => ({
    gtZero: 'Combo price must be greater than ₹0',
    notLess: `Combo price must be less than the actual price (${formatINR(this.actualPrice())})`,
  }));

  constructor() {
    const c = this.form.controls;
    c.comboPrice.addValidators((ctrl) => this.checkComboPrice(ctrl));
    c.validTo.addValidators((ctrl) => this.checkValidTo(ctrl));

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    this.rows.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.gstManual()) c.gstPercent.setValue(this.highestGstOfRows(), { emitEvent: false });
      c.comboPrice.updateValueAndValidity({ emitEvent: false });
    });

    c.validFrom.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      c.validTo.updateValueAndValidity({ emitEvent: false });
    });

    // Reset the form every time the dialog opens (add = 2 empty rows, edit = record values).
    effect(() => {
      if (!this.visible()) return;
      const combo = this.combo();
      untracked(() => this.open(combo));
    });
  }

  // ---------------------------------------------------------------- template helpers

  protected optionsAt(i: number): ComboItemOption[] {
    return this.rowOptions()[i] ?? [];
  }

  protected amountAt(i: number): number {
    return this.lines()[i]?.amount ?? 0;
  }

  protected decimalsAt(i: number): number {
    return this.lines()[i]?.option?.allowDecimal ? 3 : 0;
  }

  protected canAddRow(): boolean {
    return this.rows.length < Math.max(MIN_ROWS, this.itemOptions().length);
  }

  protected addRow(): void {
    this.rows.push(this.newRow());
    this.rows.markAsDirty();
  }

  protected removeRow(index: number): void {
    if (this.rows.length <= MIN_ROWS) return;
    this.rows.removeAt(index);
    this.rows.markAsDirty();
  }

  protected onGstPicked(): void {
    this.gstManual.set(true);
  }

  protected useHighestGst(): void {
    this.gstManual.set(false);
    this.form.controls.gstPercent.setValue(this.highestGstOfRows());
  }

  // ---------------------------------------------------------------- internals

  private newRow(itemId: string | null = null, qty: number | null = 1): ComboRow {
    return this.fb.group({
      itemId: this.fb.control<string | null>(itemId, Validators.required),
      qty: this.fb.control<number | null>(qty, [Validators.required, Validators.min(0.001)]),
    });
  }

  private open(combo: Combo | null): void {
    this.rows.clear({ emitEvent: false });
    const rows = combo ? combo.items.map((ci) => this.newRow(ci.itemId, ci.qty)) : [];
    while (rows.length < MIN_ROWS) rows.push(this.newRow());
    rows.forEach((r) => this.rows.push(r, { emitEvent: false }));

    // Edit: keep the saved GST until we know whether it equals the highest item GST.
    this.gstManual.set(!!combo);
    this.form.reset({
      name: combo?.name ?? '',
      items: rows.map((r) => r.getRawValue()),
      comboPrice: combo?.comboPrice ?? null,
      gstPercent: combo?.gstPercent ?? null,
      validFrom: strToDate(combo?.validFrom),
      validTo: strToDate(combo?.validTo),
      image: combo?.image ?? null,
      status: combo?.status ?? 'ACTIVE',
    });
    this.value.set(this.form.getRawValue());
    this.loadOptions(combo);
  }

  private loadOptions(combo: Combo | null): void {
    this.optionsSub?.unsubscribe();
    this.loadingOptions.set(true);
    this.optionsSub = this.items.listActive({ saleable: true }).subscribe({
      next: (res) => {
        const options: ComboItemOption[] = res.data.map((i) => ({
          value: i.id,
          name: i.name,
          price: i.sellingPrice,
          gst: i.gstPercent,
          allowDecimal: i.allowDecimal,
          label: `${i.name} — ${formatINR(i.sellingPrice)}`,
        }));
        // Items of an existing combo that are no longer active stay selectable.
        for (const ci of combo?.items ?? []) {
          if (!options.some((o) => o.value === ci.itemId)) {
            options.push({
              value: ci.itemId,
              name: ci.itemName,
              price: ci.price,
              gst: 0,
              allowDecimal: !Number.isInteger(ci.qty),
              label: `${ci.itemName} — ${formatINR(ci.price)} (inactive)`,
            });
          }
        }
        this.itemOptions.set(options);
        this.loadingOptions.set(false);
        if (combo) this.gstManual.set(combo.gstPercent !== this.highestGstOfRows());
        this.form.controls.comboPrice.updateValueAndValidity();
      },
      error: () => this.loadingOptions.set(false),
    });
  }

  /** Σ price × qty straight from the controls (validators run before the value signal updates). */
  private actualFromRows(): number {
    const map = untracked(() => this.itemMap());
    return round2(
      this.rows.getRawValue().reduce((s, r) => s + (r.itemId ? (map.get(r.itemId)?.price ?? 0) * (r.qty ?? 0) : 0), 0),
    );
  }

  private highestGstOfRows(): GstRate | null {
    const map = untracked(() => this.itemMap());
    const rates = this.rows
      .getRawValue()
      .map((r) => (r.itemId ? map.get(r.itemId)?.gst : undefined))
      .filter((g): g is GstRate => g !== undefined);
    return rates.length ? (Math.max(...rates) as GstRate) : null;
  }

  private checkComboPrice(ctrl: AbstractControl): ValidationErrors | null {
    const price = ctrl.value as number | null;
    if (price === null || price === undefined) return null;
    if (price <= 0) return { gtZero: true };
    const actual = this.actualFromRows();
    return actual > 0 && price >= actual ? { notLess: true } : null;
  }

  private checkValidTo(ctrl: AbstractControl): ValidationErrors | null {
    const to = dateToStr(ctrl.value as Date | null);
    const from = dateToStr((ctrl.parent?.get('validFrom')?.value as Date | null | undefined) ?? null);
    return to && from && to < from ? { beforeFrom: true } : null;
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const map = this.itemMap();
    const body: ComboSave = {
      name: v.name.trim(),
      items: v.items.map((r) => {
        const option = r.itemId ? map.get(r.itemId) : undefined;
        return { itemId: r.itemId ?? '', itemName: option?.name ?? '', qty: r.qty ?? 0, price: option?.price ?? 0 };
      }),
      comboPrice: v.comboPrice ?? 0,
      gstPercent: v.gstPercent ?? this.highestGst() ?? 0,
      validFrom: dateToStr(v.validFrom),
      validTo: dateToStr(v.validTo),
      image: v.image,
      status: v.status,
    };
    const existing = this.combo();
    this.saving.set(true);
    (existing ? this.combos.update(existing.id, body) : this.combos.create(body)).subscribe({
      next: (combo) => {
        this.saving.set(false);
        this.notify.success(`Combo "${combo.name}" ${existing ? 'updated' : 'created'}`);
        this.saved.emit(combo);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
