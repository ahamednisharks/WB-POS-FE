import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { StockIssue } from '../../core/models';
import { NotifyService } from '../../core/services/notify.service';
import { StockIssueService } from '../../core/services/stock-issue.service';
import { applyServerError } from '../../core/utils/http-error.util';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

/** Cancel a stock issue (ADMIN) — every line goes back into stock; a reason is mandatory. */
@Component({
  selector: 'app-stock-issue-cancel-dialog',
  imports: [ReactiveFormsModule, ButtonModule, TextareaModule, FieldErrorComponent, FormDialogComponent],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="'Cancel ' + (issue()?.issueNo ?? 'Stock Issue')" width="480px">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex gap-2" style="flex-direction: column">
        <p class="muted small" style="margin: 0">
          The stock of every line will be <strong>put back</strong> into the warehouse and the issue marked
          <strong>Cancelled</strong>. This cannot be undone.
        </p>
        <div class="field">
          <label for="si-cancel-reason">Reason <span class="req">*</span></label>
          <textarea
            pTextarea
            id="si-cancel-reason"
            formControlName="reason"
            rows="3"
            maxlength="200"
            placeholder="e.g. Entered on the wrong item"
          ></textarea>
          <app-field-error
            [control]="form.controls.reason"
            label="Reason"
            [messages]="{ pattern: 'Reason is required' }"
          />
        </div>
        <button type="submit" hidden aria-hidden="true"></button>
      </form>

      <div dialogFooter class="dialog-footer">
        <p-button label="Keep Issue" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button
          label="Cancel Issue"
          icon="pi pi-ban"
          severity="danger"
          [loading]="saving()"
          [disabled]="form.invalid || saving()"
          (onClick)="submit()"
        />
      </div>
    </app-form-dialog>
  `,
})
export class StockIssueCancelDialogComponent {
  readonly visible = model(false);
  readonly issue = input<StockIssue | null>(null);
  readonly cancelled = output<StockIssue>();

  private readonly fb = inject(FormBuilder);
  private readonly issues = inject(StockIssueService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]],
  });

  constructor() {
    effect(() => {
      if (this.visible()) this.form.reset({ reason: '' });
    });
  }

  protected submit(): void {
    const issue = this.issue();
    if (!issue || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.issues.cancel(issue.id, this.form.getRawValue().reason.trim()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.notify.success(`Stock issue ${updated.issueNo} cancelled — stock put back`);
        this.cancelled.emit(updated);
        this.visible.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        applyServerError(this.form, err);
      },
    });
  }
}
