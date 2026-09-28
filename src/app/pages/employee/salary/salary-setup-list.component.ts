import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ListQuery, SalarySetup } from '../../../core/models';
import { SalarySetupService } from '../../../core/services/salary-setup.service';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { EnumLabelPipe, IstDatePipe } from '../../../shared/pipes/display.pipes';
import { SalarySetupFormComponent } from './salary-setup-form.component';

@Component({
  selector: 'app-salary-setup-list',
  imports: [
    TableModule,
    ButtonModule,
    TooltipModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    IstDatePipe,
    EnumLabelPipe,
    SalarySetupFormComponent,
  ],
  templateUrl: './salary-setup-list.component.html',
  styleUrl: './salary-tab.scss',
})
export class SalarySetupListComponent extends ListPageBase<SalarySetup> {
  private readonly setups = inject(SalarySetupService);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<SalarySetup | null>(null);
  protected readonly search$ = new Subject<string>();

  constructor() {
    super();
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => this.onSearch(term.trim()));
  }

  protected fetch(query: ListQuery) {
    return this.setups.list(query);
  }

  protected openForm(setup: SalarySetup | null = null): void {
    this.editing.set(setup);
    this.formVisible.set(true);
  }

  protected remove(setup: SalarySetup): void {
    void this.confirmAndDelete(`salary setup of "${setup.employeeName}"`, () => this.setups.remove(setup.id));
  }
}
