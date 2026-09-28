import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { Option, Status, Supplier, SupplierSave } from '../../../core/models';
import { NotifyService } from '../../../core/services/notify.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { INDIAN_STATES, PATTERNS, STATUS_OPTIONS } from '../../../core/utils/constants';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';

/** GSTIN is validated upper-cased so users can type in any case. */
function gstinValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return !value || PATTERNS.gstin.test(value.toUpperCase()) ? null : { pattern: true };
}

@Component({
  selector: 'app-supplier-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    TextareaModule,
    FieldErrorComponent,
    FormDialogComponent,
    InrCurrencyPipe,
  ],
  templateUrl: './supplier-form.component.html',
})
export class SupplierFormComponent {
  readonly visible = model(false);
  readonly supplier = input<Supplier | null>(null);
  readonly saved = output<Supplier>();

  private readonly fb = inject(FormBuilder);
  private readonly suppliers = inject(SupplierService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly states: Option[] = INDIAN_STATES.map((s) => ({ label: s, value: s }));

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    contactPerson: ['', Validators.maxLength(60)],
    mobile: ['', [Validators.required, Validators.pattern(PATTERNS.mobile)]],
    email: ['', [Validators.email, Validators.maxLength(100)]],
    address: ['', [Validators.required, Validators.maxLength(250)]],
    state: [null as string | null, Validators.required],
    gstin: ['', gstinValidator],
    openingBalance: [0 as number | null],
    paymentTermsDays: [0 as number | null, [Validators.min(0), Validators.max(365)]],
    status: ['ACTIVE' as Status, Validators.required],
  });

  constructor() {
    // Reset the form every time the dialog opens (add = blank, edit = record values).
    effect(() => {
      if (!this.visible()) return;
      const s = this.supplier();
      untracked(() =>
        this.form.reset({
          name: s?.name ?? '',
          contactPerson: s?.contactPerson ?? '',
          mobile: s?.mobile ?? '',
          email: s?.email ?? '',
          address: s?.address ?? '',
          state: s?.state ?? null,
          gstin: s?.gstin ?? '',
          openingBalance: s?.openingBalance ?? 0,
          paymentTermsDays: s?.paymentTermsDays ?? 0,
          status: s?.status ?? 'ACTIVE',
        }),
      );
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: SupplierSave = {
      name: v.name.trim(),
      contactPerson: v.contactPerson.trim(),
      mobile: v.mobile.trim(),
      email: v.email.trim(),
      address: v.address.trim(),
      state: v.state ?? '',
      gstin: v.gstin.trim().toUpperCase(),
      openingBalance: v.openingBalance ?? 0,
      paymentTermsDays: v.paymentTermsDays ?? 0,
      status: v.status,
    };
    const existing = this.supplier();
    this.saving.set(true);
    (existing ? this.suppliers.update(existing.id, body) : this.suppliers.create(body)).subscribe({
      next: (supplier) => {
        this.saving.set(false);
        this.notify.success(`Supplier "${supplier.name}" ${existing ? 'updated' : `created (${supplier.code})`}`);
        this.saved.emit(supplier);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
