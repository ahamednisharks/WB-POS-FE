import { Component, computed, effect, input, model, output, signal, untracked } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { round3 } from '../../core/utils/tax.util';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

/** Touch number pad for weights (0.500 KG) or whole quantities. */
@Component({
  selector: 'app-weight-pad',
  imports: [ButtonModule, FormDialogComponent],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <app-form-dialog [(visible)]="visible" [header]="title()" width="360px">
      <div class="pad">
        <div class="display" aria-live="polite">
          <span class="value">{{ text() || '0' }}</span>
          <span class="unit">{{ unitCode() }}</span>
        </div>
        @if (allowDecimal()) {
          <div class="presets">
            @for (p of presets; track p) {
              <button type="button" (click)="setText(p)">{{ p }}</button>
            }
          </div>
        }
        <div class="keys">
          @for (k of keys; track k) {
            <button
              type="button"
              class="key"
              [disabled]="k === '.' && !allowDecimal()"
              (click)="press(k)"
              [attr.aria-label]="k === '⌫' ? 'Backspace' : k"
            >
              {{ k }}
            </button>
          }
        </div>
      </div>
      <div dialogFooter class="dialog-footer">
        <p-button label="Clear" severity="secondary" [text]="true" (onClick)="text.set('')" />
        <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" />
        <p-button label="OK" icon="pi pi-check" [disabled]="value() <= 0" (onClick)="confirm()" />
      </div>
    </app-form-dialog>
  `,
  styles: `
    .pad {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .display {
      display: flex;
      justify-content: flex-end;
      align-items: baseline;
      gap: 0.4rem;
      background: #1f2328;
      color: #fff;
      border-radius: 12px;
      padding: 0.75rem 1rem;
      font-variant-numeric: tabular-nums;
    }
    .value {
      font-size: 2rem;
      font-weight: 700;
    }
    .unit {
      color: #f5b700;
      font-weight: 600;
    }
    .presets {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.4rem;
    }
    .presets button {
      padding: 0.5rem 0;
      border-radius: 8px;
      border: 1px solid #ffe98a;
      background: var(--brand-softer);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .keys {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }
    .key {
      height: 56px;
      border-radius: 12px;
      border: 1px solid var(--border-soft);
      background: #fff;
      font: inherit;
      font-size: 1.35rem;
      font-weight: 600;
      cursor: pointer;
    }
    .key:hover:not(:disabled) {
      background: var(--brand-soft);
    }
    .key:disabled {
      opacity: 0.35;
    }
  `,
})
export class WeightPadComponent {
  readonly visible = model(false);
  readonly title = input('Enter weight');
  readonly unitCode = input('KG');
  readonly allowDecimal = input(true);
  readonly initial = input<number | null>(null);
  readonly confirmed = output<number>();

  protected readonly keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];
  protected readonly presets = ['0.250', '0.500', '0.750', '1.000'];
  protected readonly text = signal('');
  protected readonly value = computed(() => Number(this.text()) || 0);

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const initial = this.initial();
      untracked(() => this.text.set(initial ? String(initial) : ''));
    });
  }

  protected setText(value: string): void {
    this.text.set(value);
  }

  protected press(key: string): void {
    const t = this.text();
    if (key === '⌫') {
      this.text.set(t.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (!this.allowDecimal() || t.includes('.')) return;
      this.text.set(t ? `${t}.` : '0.');
      return;
    }
    const decimals = t.includes('.') ? t.split('.')[1].length : 0;
    if (decimals >= 3 || t.replace('.', '').length >= 7) return;
    this.text.set(t === '0' ? key : t + key);
  }

  protected confirm(): void {
    const v = this.allowDecimal() ? round3(this.value()) : Math.round(this.value());
    if (v <= 0) return;
    this.confirmed.emit(v);
    this.visible.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.visible()) return;
    if (/^[0-9]$/.test(event.key)) this.press(event.key);
    else if (event.key === '.' || event.key === ',') this.press('.');
    else if (event.key === 'Backspace') this.press('⌫');
    else if (event.key === 'Enter') this.confirm();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }
}
