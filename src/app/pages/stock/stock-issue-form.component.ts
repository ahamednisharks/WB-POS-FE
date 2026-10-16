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
import { IssueReason, StockIssue, StockIssueSave } from '../../core/models';
import { ItemService } from '../../core/services/item.service';
import { LayoutService } from '../../core/services/layout.service';
import { NotifyService } from '../../core/services/notify.service';
import { StockIssueService } from '../../core/services/stock-issue.service';
import { dateToStr, strToDate, todayIST } from '../../core/utils/date.util';
import { apiErrorField, apiErrorMessage, applyServerError } from '../../core/utils/http-error.util';
import { round2, round3 } from '../../core/utils/tax.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { QtyPipe } from '../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../shared/pipes/inr-currency.pipe';
import { optionsPerRow, sameIds } from '../transactions/purchase-order/purchase-form.util';
import { fallbackStockItemOption, ISSUE_REASON_OPTIONS, StockItemOption, toStockItemOption } from './stock.shared';

type LineForm = FormGroup<{
  itemId: FormControl<string>;
  qty: FormControl<number | null>;
  reason: FormControl<IssueReason>;
  remarks: FormControl<string>;
}>;

interface LineInit {
  itemId: string;
  qty: number | null;
  reason: IssueReason;
  remarks: string;
}

/** Live figures per row: value at the last purchase rate and whether the qty exceeds what is available. */
interface LineCalc {
  available: number | null;
  unitCode: string;
  amount: number;
  exceeds: boolean;
}

/** Remarks are mandatory when the reason is "Other" (same rule as the API). */
const remarksForOther: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const reason = g.get('reason')?.value as IssueReason | null;
  const remarks = String(g.get('remarks')?.value ?? '').trim();
  return reason === 'OTHER' && !remarks ? { remarksRequired: true } : null;
};

const dateNotFuture: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const day = dateToStr(g.get('issueDate')?.value as Date | null);
  return day && day > todayIST() ? { dateFuture: true } : null;
};

/** Create / edit a Stock Issue: raw material sent to production (or written off), one line per item. */
@Component({
  selector: 'app-stock-issue-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
    QtyPipe,
  ],
  templateUrl: './stock-issue-form.component.html',
  styleUrls: ['../transactions/purchase-order/purchase-shared.scss', './stock.scss'],
})
export class StockIssueFormComponent {
  readonly visible = model(false);
  /** Null = new issue. */
  readonly issue = input<StockIssue | null>(null);
  readonly saved = output<StockIssue>();

  private readonly fb = inject(FormBuilder);
  private readonly issues = inject(StockIssueService);
  private readonly itemService = inject(ItemService);
  private readonly notify = inject(NotifyService);
  protected readonly layout = inject(LayoutService);

  protected readonly today = new Date();
  protected readonly reasonOptions = ISSUE_REASON_OPTIONS;

  protected readonly saving = signal(false);
  protected readonly itemsLoading = signal(false);
  private readonly activeItems = signal<StockItemOption[]>([]);
  /** Items on the issue being edited that may no longer be active. */
  private readonly extraItems = signal<StockItemOption[]>([]);

  protected readonly form = this.fb.nonNullable.group(
    {
      issueDate: [new Date() as Date | null, Validators.required],
      remarks: ['', Validators.maxLength(200)],
      items: new FormArray<LineForm>([], Validators.minLength(1)),
    },
    { validators: dateNotFuture },
  );

  protected get lines(): FormArray<LineForm> {
    return this.form.controls.items;
  }

  /** Form value as a signal so the per-row figures and the pickers update live. */
  private readonly value = signal(this.form.getRawValue());

  protected readonly items = computed(() => {
    const active = this.activeItems();
    const extra = this.extraItems().filter((e) => !active.some((a) => a.id === e.id));
    return [...active, ...extra];
  });
  protected readonly itemMap = computed(() => new Map(this.items().map((i) => [i.id, i])));
  private readonly pickedIds = computed(() => this.value().items.map((l) => l.itemId), { equal: sameIds });
  protected readonly rowOptions = computed(() => optionsPerRow(this.pickedIds(), this.items()));

  protected readonly calc = computed<LineCalc[]>(() =>
    this.value().items.map((l) => {
      const item = this.itemMap().get(l.itemId);
      const qty = l.qty ?? 0;
      const available = item ? this.availableFor(item) : null;
      return {
        available,
        unitCode: item?.unitCode ?? '',
        amount: round2(qty * (item?.purchasePrice ?? 0)),
        exceeds: available !== null && qty > available + 0.0005,
      };
    }),
  );
  protected readonly totalValue = computed(() => round2(this.calc().reduce((sum, c) => sum + c.amount, 0)));
  protected readonly anyExceeds = computed(() => this.calc().some((c) => c.exceeds));

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.value.set(this.form.getRawValue()));

    // Reset every time the dialog opens: new = one blank row, edit = the saved lines.
    effect(() => {
      if (!this.visible()) return;
      const issue = this.issue();
      untracked(() => this.open(issue));
    });
  }

  /**
   * What the line may take: the item's stock right now, plus the quantity this issue already holds
   * when editing (that quantity is put back before the new lines are posted).
   */
  private availableFor(item: StockItemOption): number {
    const existing = this.issue();
    const own = existing?.status === 'POSTED' ? (existing.items.find((i) => i.itemId === item.id)?.qty ?? 0) : 0;
    return round3(item.currentStock + own);
  }

  private open(issue: StockIssue | null): void {
    this.extraItems.set(issue ? issue.items.map(fallbackStockItemOption) : []);
    this.lines.clear({ emitEvent: false });
    if (issue) {
      issue.items.forEach((i) =>
        this.lines.push(
          this.newLine({ itemId: i.itemId, qty: i.qty, reason: i.reason, remarks: i.remarks ?? '' }),
          { emitEvent: false },
        ),
      );
    } else {
      this.lines.push(this.newLine(), { emitEvent: false });
    }
    this.form.reset({
      issueDate: issue ? strToDate(issue.issueDate) : new Date(),
      remarks: issue?.remarks ?? '',
    });
    this.loadItems();
  }

  private loadItems(): void {
    this.itemsLoading.set(true);
    this.itemService.listActive({ purchasable: true }).subscribe({
      next: (res) => {
        this.activeItems.set(res.data.map(toStockItemOption));
        this.itemsLoading.set(false);
      },
      error: () => this.itemsLoading.set(false),
    });
  }

  private newLine(v?: LineInit): LineForm {
    return this.fb.nonNullable.group(
      {
        itemId: [v?.itemId ?? '', Validators.required],
        qty: [v?.qty ?? null, [Validators.required, Validators.min(0.001)]],
        reason: [v?.reason ?? ('PRODUCTION' as IssueReason), Validators.required],
        remarks: [v?.remarks ?? '', Validators.maxLength(200)],
      },
      { validators: remarksForOther },
    );
  }

  protected addLine(): void {
    this.lines.push(this.newLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  /** Whole-unit items (PCS, BOX) cannot take a fractional quantity. */
  protected onItemPicked(index: number, itemId: string | null): void {
    const item = itemId ? this.itemMap().get(itemId) : undefined;
    if (!item) return;
    const line = this.lines.at(index);
    const qty = line.controls.qty.value;
    if (qty !== null && !item.allowDecimal) line.controls.qty.setValue(Math.round(qty) || null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const existing = this.issue();
    const body: StockIssueSave = {
      issueDate: dateToStr(v.issueDate) ?? '',
      remarks: v.remarks.trim() || null,
      items: v.items.map((l) => ({
        itemId: l.itemId,
        qty: l.qty ?? 0,
        reason: l.reason,
        remarks: l.remarks.trim() || null,
      })),
    };
    this.saving.set(true);
    (existing ? this.issues.update(existing.id, body) : this.issues.create(body)).subscribe({
      next: (issue) => {
        this.saving.set(false);
        this.notify.success(
          existing
            ? `Stock issue ${issue.issueNo} updated — stock adjusted`
            : `Stock issue ${issue.issueNo} saved — stock reduced`,
        );
        this.saved.emit(issue);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
        // "Insufficient stock for X (available N)" names no field — pin it above the item rows.
        if (!apiErrorField(err)) this.lines.setErrors({ ...(this.lines.errors ?? {}), server: apiErrorMessage(err) });
      },
    });
  }
}
