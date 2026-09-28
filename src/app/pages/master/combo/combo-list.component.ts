import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Combo, ListQuery } from '../../../core/models';
import { ComboService } from '../../../core/services/combo.service';
import { todayIST } from '../../../core/utils/date.util';
import { formatQty } from '../../../core/utils/format.util';
import { ListPageBase } from '../../../shared/base/list-page.base';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonRowComponent } from '../../../shared/components/skeleton-row/skeleton-row.component';
import { StatusTagComponent } from '../../../shared/components/status-tag/status-tag.component';
import { IstDatePipe } from '../../../shared/pipes/display.pipes';
import { InrCurrencyPipe } from '../../../shared/pipes/inr-currency.pipe';
import { ComboFormComponent } from './combo-form.component';

@Component({
  selector: 'app-combo-list',
  imports: [
    TableModule,
    ButtonModule,
    TooltipModule,
    PageHeaderComponent,
    StatusTagComponent,
    EmptyStateComponent,
    SkeletonRowComponent,
    InrCurrencyPipe,
    IstDatePipe,
    ComboFormComponent,
  ],
  templateUrl: './combo-list.component.html',
  styles: `
    .combo-items {
      min-width: 14rem;
      max-width: 24rem;
      white-space: normal;
      line-height: 1.35;
    }
  `,
})
export class ComboListComponent extends ListPageBase<Combo> {
  private readonly combos = inject(ComboService);

  protected readonly formVisible = signal(false);
  protected readonly editing = signal<Combo | null>(null);
  protected readonly today = todayIST();

  protected fetch(query: ListQuery) {
    return this.combos.list(query);
  }

  /** "Masala Tea × 1, Veg Puff × 2" */
  protected itemsText(combo: Combo): string {
    return combo.items.map((i) => `${i.itemName} × ${formatQty(i.qty)}`).join(', ');
  }

  protected isExpired(combo: Combo): boolean {
    return !!combo.validTo && combo.validTo < this.today;
  }

  protected isUpcoming(combo: Combo): boolean {
    return !!combo.validFrom && combo.validFrom > this.today;
  }

  protected openForm(combo: Combo | null = null): void {
    this.editing.set(combo);
    this.formVisible.set(true);
  }

  protected remove(combo: Combo): void {
    void this.confirmAndDelete(`combo "${combo.name}"`, () => this.combos.remove(combo.id));
  }
}
