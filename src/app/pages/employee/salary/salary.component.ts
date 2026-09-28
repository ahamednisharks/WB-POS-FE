import { Component, signal } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SalaryPaymentListComponent } from './salary-payment-list.component';
import { SalarySetupListComponent } from './salary-setup-list.component';

/** Salary Details: "Salary Setup" and "Monthly Payment" tabs (each tab is created on first open). */
@Component({
  selector: 'app-salary',
  imports: [TabsModule, PageHeaderComponent, SalarySetupListComponent, SalaryPaymentListComponent],
  template: `
    <div class="page">
      <app-page-header
        title="Salary Details"
        subtitle="Salary setup per employee and monthly salary payments"
        [showSearch]="false"
        [showAdd]="false"
      />

      <div class="card p-0">
        <p-tabs [(value)]="tab" [lazy]="true" [scrollable]="true">
          <p-tablist>
            <p-tab value="setup"><i class="pi pi-sliders-h" aria-hidden="true"></i> Salary Setup</p-tab>
            <p-tab value="payment"><i class="pi pi-calendar" aria-hidden="true"></i> Monthly Payment</p-tab>
          </p-tablist>
          <p-tabpanels>
            <p-tabpanel value="setup">
              <ng-template #content>
                <app-salary-setup-list />
              </ng-template>
            </p-tabpanel>
            <p-tabpanel value="payment">
              <ng-template #content>
                <app-salary-payment-list />
              </ng-template>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </div>
    </div>
  `,
})
export class SalaryComponent {
  protected readonly tab = signal<string | number | undefined>('setup');
}
