import { inject, Injectable } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

export interface ConfirmOptions {
  header: string;
  message: string;
  acceptLabel?: string;
  rejectLabel?: string;
  icon?: string;
  danger?: boolean;
}

export const CONFIRM_KEY = 'app-confirm';

/** Promise-based confirm dialog rendered by <app-confirm-delete> in the root component. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly confirmation = inject(ConfirmationService);

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmation.confirm({
        key: CONFIRM_KEY,
        header: options.header,
        message: options.message,
        icon: options.icon ?? 'pi pi-question-circle',
        acceptButtonProps: { label: options.acceptLabel ?? 'Yes', severity: options.danger ? 'danger' : 'primary' },
        rejectButtonProps: { label: options.rejectLabel ?? 'Cancel', severity: 'secondary', outlined: true },
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }

  /** "Delete <what>? This cannot be undone." */
  confirmDelete(what: string): Promise<boolean> {
    return this.ask({
      header: 'Confirm delete',
      message: `Delete ${what}? If it is used elsewhere it will be marked Inactive instead.`,
      acceptLabel: 'Delete',
      icon: 'pi pi-trash',
      danger: true,
    });
  }
}
