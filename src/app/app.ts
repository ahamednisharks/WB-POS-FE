import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular/standalone';
import { ToastModule } from 'primeng/toast';
import { ConfirmDeleteComponent } from './shared/components/confirm-delete/confirm-delete.component';
import { PrintHostComponent } from './shared/components/print/print-host.component';

@Component({
  selector: 'app-root',
  imports: [IonApp, RouterOutlet, ToastModule, ConfirmDeleteComponent, PrintHostComponent],
  template: `
    <ion-app>
      <router-outlet />
    </ion-app>
    <p-toast position="top-right" [baseZIndex]="40000" />
    <app-confirm-delete />
    <app-print-host />
  `,
})
export class App {}
