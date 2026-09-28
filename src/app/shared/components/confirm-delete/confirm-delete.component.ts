import { Component } from '@angular/core';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CONFIRM_KEY } from './confirm.service';

/** Single app-wide confirm dialog; open it through ConfirmService.confirmDelete() / ask(). */
@Component({
  selector: 'app-confirm-delete',
  imports: [ConfirmDialogModule],
  template: `
    <p-confirmdialog
      [key]="key"
      appendTo="body"
      [style]="{ width: '440px' }"
      [breakpoints]="{ '575px': '92vw' }"
      [closeOnEscape]="true"
      [dismissableMask]="true"
    />
  `,
})
export class ConfirmDeleteComponent {
  protected readonly key = CONFIRM_KEY;
}
