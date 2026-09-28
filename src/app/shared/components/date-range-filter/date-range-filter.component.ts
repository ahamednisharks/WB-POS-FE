import { Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { DatePreset, DateRange, dateToStr, presetRange, strToDate } from '../../../core/utils/date.util';
import { Option } from '../../../core/models';

const PRESETS: Option<DatePreset>[] = [
  { label: 'Today', value: 'TODAY' },
  { label: 'Yesterday', value: 'YESTERDAY' },
  { label: 'This week', value: 'WEEK' },
  { label: 'This month', value: 'MONTH' },
  { label: 'Custom range', value: 'CUSTOM' },
];

/**
 * Period filter: Today / Yesterday / This week / This month / Custom range.
 * Lays out as `.filter` blocks so it slots into a `.filter-bar`.
 */
@Component({
  selector: 'app-date-range-filter',
  imports: [FormsModule, SelectModule, DatePickerModule],
  template: `
    <div class="filter">
      <label [for]="id + '-preset'">{{ label() }}</label>
      <p-select
        [inputId]="id + '-preset'"
        [options]="presets"
        optionLabel="label"
        optionValue="value"
        [ngModel]="preset()"
        (ngModelChange)="onPreset($event)"
        [disabled]="disabled()"
      />
    </div>
    @if (preset() === 'CUSTOM') {
      <div class="filter">
        <label [for]="id + '-range'">From – To</label>
        <p-datepicker
          [inputId]="id + '-range'"
          selectionMode="range"
          [readonlyInput]="true"
          [showIcon]="true"
          [maxDate]="today"
          dateFormat="dd-mm-yy"
          [ngModel]="pickerValue()"
          (ngModelChange)="onPicked($event)"
          placeholder="Select dates"
        />
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class DateRangeFilterComponent {
  readonly label = input('Period');
  readonly disabled = input(false);
  readonly preset = model<DatePreset>('TODAY');
  readonly range = model<DateRange>(presetRange('TODAY'));
  /** Fires once per user change with the final range. */
  readonly changed = output<DateRange>();

  protected readonly presets = PRESETS;
  protected readonly id = `drf-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly today = new Date();
  private readonly picked = signal<Date[] | null>(null);

  protected readonly pickerValue = computed<Date[] | null>(() => {
    const p = this.picked();
    if (p) return p;
    const r = this.range();
    const from = strToDate(r.from);
    const to = strToDate(r.to);
    return from && to ? [from, to] : null;
  });

  protected onPreset(value: DatePreset): void {
    this.preset.set(value);
    this.picked.set(null);
    if (value !== 'CUSTOM') {
      const r = presetRange(value);
      this.range.set(r);
      this.changed.emit(r);
    }
  }

  protected onPicked(value: (Date | null)[] | null): void {
    const dates = (value ?? []).filter((d): d is Date => d instanceof Date);
    this.picked.set(dates);
    if (dates.length === 2) {
      const r = { from: dateToStr(dates[0])!, to: dateToStr(dates[1])! };
      this.range.set(r);
      this.changed.emit(r);
    }
  }
}
