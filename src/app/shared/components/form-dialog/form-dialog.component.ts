import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, model, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { DialogModule } from 'primeng/dialog';
import { LayoutService } from '../../../core/services/layout.service';

/**
 * Form container: PrimeNG Dialog on tablet/desktop, full-screen Ionic modal on phones.
 * Body = default slot, buttons = `[dialogFooter]` slot.
 */
@Component({
  selector: 'app-form-dialog',
  imports: [
    NgTemplateOutlet,
    DialogModule,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
  ],
  templateUrl: './form-dialog.component.html',
  styleUrl: './form-dialog.component.scss',
})
export class FormDialogComponent {
  readonly visible = model(false);
  readonly header = input('');
  readonly width = input('640px');
  readonly maximizable = input(false);
  /** Emitted after the dialog/modal has closed (by any means). */
  readonly closed = output<void>();

  protected readonly layout = inject(LayoutService);

  close(): void {
    this.visible.set(false);
  }

  protected onDialogVisibleChange(value: boolean): void {
    this.visible.set(value);
  }

  protected onModalDismiss(): void {
    if (this.visible()) this.visible.set(false);
    this.closed.emit();
  }
}
