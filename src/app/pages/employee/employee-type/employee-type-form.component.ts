import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { EmployeeType, EmployeeTypeSave, Status } from '../../../core/models';
import { EmployeeTypeService } from '../../../core/services/employee-type.service';
import { NotifyService } from '../../../core/services/notify.service';
import { STATUS_OPTIONS } from '../../../core/utils/constants';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-employee-type-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectButtonModule,
    ToggleSwitchModule,
    FieldErrorComponent,
    FormDialogComponent,
  ],
  templateUrl: './employee-type-form.component.html',
})
export class EmployeeTypeFormComponent {
  readonly visible = model(false);
  readonly employeeType = input<EmployeeType | null>(null);
  readonly saved = output<EmployeeType>();

  private readonly fb = inject(FormBuilder);
  private readonly types = inject(EmployeeTypeService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(40)]],
    description: ['', Validators.maxLength(200)],
    canLogin: [false],
    status: ['ACTIVE' as Status, Validators.required],
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const t = this.employeeType();
      this.form.reset({
        name: t?.name ?? '',
        description: t?.description ?? '',
        canLogin: t?.canLogin ?? false,
        status: t?.status ?? 'ACTIVE',
      });
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: EmployeeTypeSave = { ...v, name: v.name.trim(), description: v.description.trim() };
    const existing = this.employeeType();
    this.saving.set(true);
    (existing ? this.types.update(existing.id, body) : this.types.create(body)).subscribe({
      next: (type) => {
        this.saving.set(false);
        this.notify.success(`Employee type "${type.name}" ${existing ? 'updated' : 'created'}`);
        this.saved.emit(type);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
