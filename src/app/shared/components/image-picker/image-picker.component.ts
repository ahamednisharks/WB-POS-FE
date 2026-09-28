import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ButtonModule } from 'primeng/button';

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
    const reader = new FileReader();
    reader.onload = () => {
      void this.resize(String(reader.result), file.type).then((url) => {
        this.busy.set(false);
        this.value.set(url);
        this.onChange(url);
      });
    };
    reader.onerror = () => {
      this.busy.set(false);
      this.error.set('Could not read the file');
    };
    reader.readAsDataURL(file);
  }

  protected clear(): void {
    this.value.set(null);
    this.error.set(null);
    this.onChange(null);
    this.onTouched();
  }

  private resize(dataUrl: string, type: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = this.maxDimension();
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
}
