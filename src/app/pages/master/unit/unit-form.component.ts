import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Status, Unit, UnitSave } from '../../../core/models';
import { NotifyService } from '../../../core/services/notify.service';
import { UnitService } from '../../../core/services/unit.service';
import { STATUS_OPTIONS } from '../../../core/utils/constants';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-unit-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    SelectButtonModule,
    ToggleSwitchModule,
    FieldErrorComponent,
    FormDialogComponent,
  ],
  templateUrl: './unit-form.component.html',
})
export class UnitFormComponent {
  readonly visible = model(false);
  readonly unit = input<Unit | null>(null);
  readonly saved = output<Unit>();

  private readonly fb = inject(FormBuilder);
  private readonly units = inject(UnitService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(30)]],
    shortCode: ['', [Validators.required, Validators.maxLength(5), Validators.pattern(/^[A-Za-z]+$/)]],
    allowDecimal: [false],
    status: ['ACTIVE' as Status, Validators.required],
  });

  constructor() {
    // Reset the form every time the dialog opens (add = blank, edit = record values).
    effect(() => {
      if (!this.visible()) return;
      const u = this.unit();
      this.form.reset({
        name: u?.name ?? '',
        shortCode: u?.shortCode ?? '',
        allowDecimal: u?.allowDecimal ?? false,
        status: u?.status ?? 'ACTIVE',
      });
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: UnitSave = { ...v, name: v.name.trim(), shortCode: v.shortCode.trim().toUpperCase() };
    const existing = this.unit();
    this.saving.set(true);
    (existing ? this.units.update(existing.id, body) : this.units.create(body)).subscribe({
      next: (unit) => {
        this.saving.set(false);
        this.notify.success(`Unit "${unit.name}" ${existing ? 'updated' : 'created'}`);
        this.saved.emit(unit);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
