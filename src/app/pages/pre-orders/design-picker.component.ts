import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { readAsDataUrl, resizeImage } from '../../core/utils/image.util';

const ACCEPT = ['image/jpeg', 'image/png'];
const MAX_SOURCE_MB = 8;
/** Longest side after resize — keeps the upload well under the 1 MB image limit. */
const MAX_DIMENSION = 720;

/**
 * Compact reference-photo field for one pre-order line (value = data URL for a new photo,
 * the stored link for an existing one, or null). Fits a table cell: Upload button, or thumbnail + remove.
 */
@Component({
  selector: 'app-design-picker',
  imports: [ButtonModule, TooltipModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DesignPickerComponent), multi: true }],
  template: `
    <input #file type="file" [accept]="accept" hidden (change)="onFile($event)" />
    @if (value(); as src) {
      <div class="design">
        <button
          type="button"
          class="thumb-btn"
          [disabled]="disabled()"
          (click)="file.click()"
          pTooltip="Change photo"
          tooltipPosition="top"
          [attr.aria-label]="'Change ' + label()"
        >
          <img [src]="src" [alt]="label()" />
        </button>
        <p-button
          icon="pi pi-times"
          severity="secondary"
          size="small"
          [text]="true"
          [rounded]="true"
          [disabled]="disabled()"
          [ariaLabel]="'Remove ' + label()"
          (onClick)="clear()"
        />
      </div>
    } @else {
      <p-button
        label="Upload"
        icon="pi pi-upload"
        size="small"
        [outlined]="true"
        [loading]="busy()"
        [disabled]="disabled()"
        [ariaLabel]="'Upload ' + label()"
        (onClick)="file.click()"
      />
    }
    @if (error()) {
      <small class="error-text">{{ error() }}</small>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .design {
      display: flex;
      align-items: center;
      gap: 0.15rem;
    }

    .thumb-btn {
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border: 1px solid var(--border-soft);
      border-radius: 8px;
      overflow: hidden;
      background: var(--brand-softer);
      cursor: pointer;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    }
  `,
})
export class DesignPickerComponent implements ControlValueAccessor {
  readonly label = input('design photo');

  protected readonly accept = ACCEPT.join(',');
  protected readonly value = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (v: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value || null);
    this.error.set(null);
  }

  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onFile(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    this.onTouched();
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      this.error.set('JPG or PNG only');
      return;
    }
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) {
      this.error.set(`Max ${MAX_SOURCE_MB} MB`);
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    readAsDataUrl(file)
      .then((dataUrl) => resizeImage(dataUrl, file.type, MAX_DIMENSION))
      .then((url) => {
        this.busy.set(false);
        this.value.set(url);
        this.onChange(url);
      })
      .catch(() => {
        this.busy.set(false);
        this.error.set('Could not read the file');
      });
  }

  protected clear(): void {
    this.value.set(null);
    this.error.set(null);
    this.onChange(null);
    this.onTouched();
  }
}
