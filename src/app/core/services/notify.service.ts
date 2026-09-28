import { inject, Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

/** Toast helper (top-right p-toast lives in the root component). */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly messages = inject(MessageService);

  success(detail: string, summary = 'Success'): void {
    this.messages.add({ severity: 'success', summary, detail, life: 3000 });
  }

  info(detail: string, summary = 'Info'): void {
    this.messages.add({ severity: 'info', summary, detail, life: 3500 });
  }

  warn(detail: string, summary = 'Warning'): void {
    this.messages.add({ severity: 'warn', summary, detail, life: 4500 });
  }

  error(detail: string, summary = 'Error'): void {
    this.messages.add({ severity: 'error', summary, detail, life: 5000 });
  }
}
