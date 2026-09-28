import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { Category, CategorySave, Status } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { NotifyService } from '../../../core/services/notify.service';
import { STATUS_OPTIONS } from '../../../core/utils/constants';
import { applyServerError } from '../../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { ImagePickerComponent } from '../../../shared/components/image-picker/image-picker.component';

@Component({
  selector: 'app-category-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectButtonModule,
    FieldErrorComponent,
    FormDialogComponent,
    ImagePickerComponent,
  ],
  templateUrl: './category-form.component.html',
})
export class CategoryFormComponent {
  readonly visible = model(false);
  readonly category = input<Category | null>(null);
  /** Display order pre-filled when adding. */
  readonly suggestedOrder = input(1);
  readonly saved = output<Category>();

  private readonly fb = inject(FormBuilder);
  private readonly categories = inject(CategoryService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    image: [null as string | null],
    displayOrder: [1 as number | null, [Validators.min(0)]],
    status: ['ACTIVE' as Status, Validators.required],
  });

  constructor() {
    // Reset the form every time the dialog opens (add = blank, edit = record values).
    effect(() => {
      if (!this.visible()) return;
      const c = this.category();
      untracked(() =>
        this.form.reset({
          name: c?.name ?? '',
          image: c?.image ?? null,
          displayOrder: c ? c.displayOrder : this.suggestedOrder(),
          status: c?.status ?? 'ACTIVE',
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
    const body: CategorySave = {
      name: v.name.trim(),
      image: v.image,
      displayOrder: v.displayOrder ?? 0,
      status: v.status,
    };
    const existing = this.category();
    this.saving.set(true);
    (existing ? this.categories.update(existing.id, body) : this.categories.create(body)).subscribe({
      next: (category) => {
        this.saving.set(false);
        this.notify.success(`Category "${category.name}" ${existing ? 'updated' : 'created'}`);
        this.saved.emit(category);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
