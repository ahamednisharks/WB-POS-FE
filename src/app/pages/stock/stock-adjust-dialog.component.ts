import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { Item, Option, StockSummaryRow } from '../../core/models';
import { ItemService } from '../../core/services/item.service';
import { NotifyService } from '../../core/services/notify.service';
import { applyServerError } from '../../core/utils/http-error.util';
import { round3 } from '../../core/utils/tax.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { QtyPipe } from '../../shared/pipes/display.pipes';

type AdjustType = 'OPENING' | 'ADJUST';
type Direction = 'ADD' | 'REMOVE';

const TYPE_OPTIONS: Option<AdjustType>[] = [
  { label: 'Opening Stock', value: 'OPENING' },
  { label: 'Adjustment', value: 'ADJUST' },
];

const DIRECTION_OPTIONS: Option<Direction>[] = [
  { label: 'Add (+)', value: 'ADD' },
  { label: 'Remove (−)', value: 'REMOVE' },
];

/** Opening stock or a manual count correction for one item (ADMIN). Posts OPENING / ADJUST to the ledger. */
@Component({
  selector: 'app-stock-adjust-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    SelectButtonModule,
    FieldErrorComponent,
    FormDialogComponent,
    QtyPipe,
  ],
  styleUrl: './stock.scss',
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Adjust Stock — ' + (item()?.name ?? '')" width="520px">
      @if (item(); as it) {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="form-grid">
          <div class="field span-all">
            <label id="adj-type-label">Type</label>
            <p-selectbutton
              formControlName="type"
              [options]="typeOptions"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              ariaLabelledBy="adj-type-label"
            />
            <small class="hint">
              {{
                form.controls.type.value === 'OPENING'
                  ? 'First stock count when you start using the system.'
                  : 'Physical count correction (the ledger keeps the reason in remarks).'
              }}
            </small>
          </div>

          <div class="field">
            <label id="adj-dir-label">Direction</label>
            <p-selectbutton
              formControlName="direction"
              [options]="directionOptions"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              ariaLabelledBy="adj-dir-label"
            />
          </div>

          <div class="field">
            <label for="adj-qty">Quantity ({{ it.unitCode }}) <span class="req">*</span></label>
            <p-inputnumber
              inputId="adj-qty"
              formControlName="qty"
              [min]="0"
              [maxFractionDigits]="it.allowDecimal ? 3 : 0"
              placeholder="0"
              inputStyleClass="w-full"
            />
            <app-field-error [control]="form.controls.qty" label="Quantity" [messages]="{ min: 'Enter qty > 0' }" />
          </div>

          <div class="field span-all">
            <label for="adj-remarks">Remarks</label>
            <input
              pInputText
              id="adj-remarks"
              formControlName="remarks"
              maxlength="200"
              placeholder="e.g. Physical count on 16-10-2026"
              autocomplete="off"
            />
            <app-field-error [control]="form.controls.remarks" label="Remarks" />
          </div>

          <div class="span-all result-box" [class.negative]="resulting() < 0">
            <span class="muted small">Current {{ it.currentStock | qty }} {{ it.unitCode }} → resulting stock</span>
            <strong>{{ resulting() | qty }} {{ it.unitCode }}</strong>
          </div>
          @if (resulting() < 0) {
            <small class="error-text span-all" role="alert">Stock cannot go below zero.</small>
          }
          <button type="submit" hidden aria-hidden="true"></button>
        </form>
      }

      <div dialogFooter class="dialog-footer">
        <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Update Stock"
          icon="pi pi-save"
          [loading]="saving()"
          [disabled]="form.invalid || saving() || resulting() < 0"
          (onClick)="submit()"
        />
      </div>
    </app-form-dialog>
  `,
})
export class StockAdjustDialogComponent {
  readonly visible = model(false);
  readonly item = input<StockSummaryRow | null>(null);
  readonly saved = output<Item>();

  private readonly fb = inject(FormBuilder);
  private readonly items = inject(ItemService);
  private readonly notify = inject(NotifyService);

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly directionOptions = DIRECTION_OPTIONS;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    type: ['ADJUST' as AdjustType, Validators.required],
    direction: ['ADD' as Direction, Validators.required],
    qty: [null as number | null, [Validators.required, Validators.min(0.001)]],
    remarks: ['', Validators.maxLength(200)],
  });

  private readonly value = signal(this.form.getRawValue());

  /** Live preview of the stock after this adjustment. */
  protected readonly resulting = computed(() => {
    const it = this.item();
    const v = this.value();
    const qty = v.qty ?? 0;
    return round3((it?.currentStock ?? 0) + (v.direction === 'REMOVE' ? -qty : qty));
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));
    effect(() => {
      if (!this.visible()) return;
      const it = this.item();
      untracked(() => {
        // An item that has never had stock is most likely being given its opening stock.
        this.form.reset({ type: it && it.currentStock === 0 ? 'OPENING' : 'ADJUST', direction: 'ADD', qty: null, remarks: '' });
        this.value.set(this.form.getRawValue());
      });
    });
  }

  protected submit(): void {
    const it = this.item();
    if (!it || this.form.invalid || this.saving() || this.resulting() < 0) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const qty = v.qty ?? 0;
    this.saving.set(true);
    this.items
      .stockAdjust(it.id, {
        type: v.type,
        qty: v.direction === 'REMOVE' ? -qty : qty,
        remarks: v.remarks.trim() || null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.notify.success(`${updated.name}: stock is now ${updated.currentStock} ${updated.unitCode}`, 'Stock updated');
          this.saved.emit(updated);
          this.visible.set(false);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          applyServerError(this.form, err);
        },
      });
  }
}
