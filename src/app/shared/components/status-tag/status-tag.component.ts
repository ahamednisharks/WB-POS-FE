import { Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { titleCase } from '../../../core/utils/format.util';

type TagSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast';

const STATUS_MAP: Record<string, { label: string; severity: TagSeverity }> = {
  ACTIVE: { label: 'Active', severity: 'success' },
  INACTIVE: { label: 'Inactive', severity: 'secondary' },
  RESIGNED: { label: 'Resigned', severity: 'secondary' },
  BLOCKED: { label: 'Blocked', severity: 'danger' },
  COMPLETED: { label: 'Completed', severity: 'success' },
  HELD: { label: 'Held', severity: 'warn' },
  CANCELLED: { label: 'Cancelled', severity: 'danger' },
  DRAFT: { label: 'Draft', severity: 'secondary' },
  SENT: { label: 'Sent', severity: 'info' },
  PARTIAL: { label: 'Partially Received', severity: 'warn' },
  RECEIVED: { label: 'Received', severity: 'success' },
  PAID: { label: 'Paid', severity: 'success' },
  PENDING: { label: 'Pending', severity: 'warn' },
  UNPAID: { label: 'Unpaid', severity: 'danger' },
  PARTLY_PAID: { label: 'Partly Paid', severity: 'warn' },
  PAYMENT: { label: 'Payment', severity: 'success' },
  REFUND: { label: 'Refund', severity: 'danger' },
  CASH_OUT: { label: 'Cash-out', severity: 'warn' },
  ADMIN: { label: 'Admin', severity: 'contrast' },
  CASHIER: { label: 'Cashier', severity: 'info' },
};

/** Coloured p-tag for any status enum (Active = green, Inactive = grey, …). */
@Component({
  selector: 'app-status-tag',
  imports: [TagModule],
  template: `<p-tag [value]="info().label" [severity]="info().severity" [rounded]="true" />`,
})
export class StatusTagComponent {
  readonly status = input.required<string | null | undefined>();
  readonly label = input<string>('');

  protected readonly info = computed(() => {
    const s = this.status() ?? '';
    const found = STATUS_MAP[s] ?? { label: titleCase(s), severity: 'secondary' as TagSeverity };
    return this.label() ? { ...found, label: this.label() } : found;
  });
}
