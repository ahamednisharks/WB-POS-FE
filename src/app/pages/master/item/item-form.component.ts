import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { forkJoin, Subscription } from 'rxjs';
import { GstRate, Item, ItemSave, ItemType, Option, Status } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { ItemService } from '../../../core/services/item.service';
import { NotifyService } from '../../../core/services/notify.service';
import { UnitService } from '../../../core/services/unit.service';
import { GST_OPTIONS, ITEM_TYPE_OPTIONS, PATTERNS, STATUS_OPTIONS } from '../../../core/utils/constants';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { ImagePickerComponent } from '../../../shared/components/image-picker/image-picker.component';
import { QtyPipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

interface UnitOption extends Option {
  code: string;
  allowDecimal: boolean;
}

@Component({
  selector: 'app-item-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    ToggleSwitchModule,
    FieldErrorComponent,
    FormDialogComponent,
    ImagePickerComponent,
    InrCurrencyPipe,
    QtyPipe,
  ],
  templateUrl: './item-form.component.html',
})
export class ItemFormComponent {
  readonly visible = model(false);
  readonly item = input<Item | null>(null);
  readonly saved = output<Item>();

  private readonly fb = inject(FormBuilder);
  private readonly items = inject(ItemService);
  private readonly categories = inject(CategoryService);
  private readonly units = inject(UnitService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly loadingOptions = signal(false);
  protected readonly categoryOptions = signal<Option[]>([]);
  protected readonly unitOptions = signal<UnitOption[]>([]);
  protected readonly typeOptions = ITEM_TYPE_OPTIONS;
  protected readonly gstOptions = GST_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;

  private optionsSub?: Subscription;
  private codeSub?: Subscription;

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(60)]],
    type: ['SALE' as ItemType, Validators.required],
    categoryId: [null as string | null, Validators.required],
    unitId: [null as string | null, Validators.required],
    sellingPrice: [null as number | null],
    gstPercent: [null as GstRate | null, Validators.required],
    priceIncludesGst: [true],
    hsnCode: ['', Validators.pattern(PATTERNS.hsn)],
    barcode: ['', Validators.maxLength(40)],
    minStock: [0 as number | null, Validators.min(0)],
    image: [null as string | null],
    status: ['ACTIVE' as Status, Validators.required],
  });

  private readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  private readonly unitId = toSignal(this.form.controls.unitId.valueChanges, {
    initialValue: this.form.controls.unitId.value,
  });

  protected readonly isRaw = computed(() => this.type() === 'RAW');
  protected readonly tracksStock = computed(() => this.type() !== 'SALE');
  private readonly selectedUnit = computed(() => this.unitOptions().find((u) => u.value === this.unitId()) ?? null);
  protected readonly unitCode = computed(() => this.selectedUnit()?.code ?? '');
  protected readonly qtyDecimals = computed(() => (this.selectedUnit()?.allowDecimal ? 3 : 0));

  constructor() {
    // Selling price is required for Sale Item / Both, not applicable to Raw Material.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => this.applyTypeRules(t));

    // Reset the form every time the dialog opens (add = blank + suggested code, edit = record values).
    effect(() => {
      if (!this.visible()) return;
      const item = this.item();
      untracked(() => this.open(item));
    });
  }

  private open(item: Item | null): void {
    this.form.reset({
      code: item?.code ?? '',
      name: item?.name ?? '',
      type: item?.type ?? 'SALE',
      categoryId: item?.categoryId ?? null,
      unitId: item?.unitId ?? null,
      sellingPrice: item && item.type !== 'RAW' ? item.sellingPrice : null,
      gstPercent: item?.gstPercent ?? null,
      priceIncludesGst: item?.priceIncludesGst ?? true,
      hsnCode: item?.hsnCode ?? '',
      barcode: item?.barcode ?? '',
      minStock: item?.minStock ?? 0,
      image: item?.image ?? null,
      status: item?.status ?? 'ACTIVE',
    });
    this.applyTypeRules(this.form.controls.type.value);
    this.loadOptions(item);

    this.codeSub?.unsubscribe();
    if (!item) {
      const code = this.form.controls.code;
      this.codeSub = this.items.suggestCode().subscribe((suggested) => {
        if (!code.dirty && !code.value) code.setValue(suggested);
      });
    }
  }

  private applyTypeRules(type: ItemType): void {
    const price = this.form.controls.sellingPrice;
    if (type === 'RAW') {
      price.clearValidators();
      price.setValue(0, { emitEvent: false });
      if (price.enabled) price.disable();
      else price.updateValueAndValidity();
    } else {
      price.setValidators([Validators.required, Validators.min(0.01)]);
      if (price.disabled) {
        price.enable({ emitEvent: false });
        if (!price.value) price.setValue(null, { emitEvent: false });
      }
      price.updateValueAndValidity();
    }
  }

  private loadOptions(item: Item | null): void {
    this.optionsSub?.unsubscribe();
    this.loadingOptions.set(true);
    this.optionsSub = forkJoin([this.categories.listActive(), this.units.listActive()]).subscribe({
      next: ([cats, units]) => {
        const categoryOptions: Option[] = cats.data.map((c) => ({ label: c.name, value: c.id }));
        const unitOptions: UnitOption[] = units.data.map((u) => ({
          label: `${u.name} (${u.shortCode})`,
          value: u.id,
          code: u.shortCode,
          allowDecimal: u.allowDecimal,
        }));
        // Keep the current (possibly inactive) category / unit selectable when editing.
        if (item && !categoryOptions.some((c) => c.value === item.categoryId)) {
          categoryOptions.push({ label: `${item.categoryName} (inactive)`, value: item.categoryId });
        }
        if (item && !unitOptions.some((u) => u.value === item.unitId)) {
          unitOptions.push({
            label: `${item.unitName} (${item.unitCode}) — inactive`,
            value: item.unitId,
            code: item.unitCode,
            allowDecimal: item.allowDecimal,
          });
        }
        this.categoryOptions.set(categoryOptions);
        this.unitOptions.set(unitOptions);
        this.loadingOptions.set(false);
      },
      error: () => this.loadingOptions.set(false),
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: ItemSave = {
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      type: v.type,
      categoryId: v.categoryId ?? '',
      unitId: v.unitId ?? '',
      sellingPrice: v.type === 'RAW' ? 0 : (v.sellingPrice ?? 0),
      gstPercent: v.gstPercent ?? 0,
      priceIncludesGst: v.priceIncludesGst,
      hsnCode: v.hsnCode.trim(),
      barcode: v.barcode.trim(),
      minStock: v.minStock ?? 0,
      image: v.image,
      status: v.status,
    };
    const existing = this.item();
    this.saving.set(true);
    (existing ? this.items.update(existing.id, body) : this.items.create(body)).subscribe({
      next: (item) => {
        this.saving.set(false);
        this.notify.success(`Item "${item.name}" ${existing ? 'updated' : 'created'} (${item.code})`);
        this.saved.emit(item);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
