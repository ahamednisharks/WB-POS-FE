import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { readAsDataUrl, resizeImage } from '../../../core/utils/image.util';

/**
 * Image upload field (value = data URL or null). Validates type/size and
 * downsizes large photos so they stay small in storage.
 */
@Component({
  selector: 'app-image-picker',
  imports: [ButtonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ImagePickerComponent), multi: true }],
  templateUrl: './image-picker.component.html',
  styleUrl: './image-picker.component.scss',
})
export class ImagePickerComponent implements ControlValueAccessor {
  readonly maxMb = input(1);
  readonly accept = input('image/jpeg,image/png');
  readonly hint = input('JPG or PNG, up to 1 MB');
  readonly round = input(false);
  /** Longest side after resize, in px. */
  readonly maxDimension = input(640);

  protected readonly value = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly disabled = signal(false);
  protected readonly busy = signal(false);

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
    const allowed = this.accept().split(',').map((t) => t.trim());
    if (!allowed.includes(file.type)) {
      this.error.set('Only JPG or PNG images are allowed');
      return;
    }
    if (file.size > this.maxMb() * 1024 * 1024) {
      this.error.set(`Image must be ${this.maxMb()} MB or smaller`);
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    readAsDataUrl(file)
      .then((dataUrl) => resizeImage(dataUrl, file.type, this.maxDimension()))
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
