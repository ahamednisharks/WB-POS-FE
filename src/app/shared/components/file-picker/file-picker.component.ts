import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { UploadedFile } from '../../../core/models';

/** Document upload field (PDF / image). Value = UploadedFile | null. */
@Component({
  selector: 'app-file-picker',
  imports: [ButtonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FilePickerComponent), multi: true }],
  template: `
    <div class="file-picker">
      <input #file type="file" [accept]="accept()" hidden (change)="onFile($event)" />
      @if (value(); as f) {
        <div class="chip">
          <i [class]="f.type === 'application/pdf' ? 'pi pi-file-pdf' : 'pi pi-image'" aria-hidden="true"></i>
          <a [href]="f.dataUrl" target="_blank" rel="noopener" [attr.download]="f.name">{{ f.name }}</a>
          <span class="size">{{ sizeLabel(f.size) }}</span>
          @if (!disabled()) {
            <button type="button" class="remove" (click)="clear()" aria-label="Remove file">
              <i class="pi pi-times"></i>
            </button>
          }
        </div>
      } @else {
        <p-button label="Choose file" icon="pi pi-paperclip" size="small" [outlined]="true" [disabled]="disabled()" (onClick)="file.click()" />
      }
      <small class="hint">{{ hint() }}</small>
      @if (error()) {
        <small class="error-text">{{ error() }}</small>
      }
    </div>
  `,
  styles: `
    .file-picker {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      align-items: flex-start;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      max-width: 100%;
      padding: 0.35rem 0.6rem;
      border: 1px solid var(--border-soft);
      border-radius: 8px;
      background: #faf8f2;
    }
    .chip a {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 220px;
    }
    .size,
    .hint {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .remove {
      border: none;
      background: none;
      cursor: pointer;
      color: var(--text-muted);
      padding: 0.1rem;
    }
  `,
})
export class FilePickerComponent implements ControlValueAccessor {
  readonly accept = input('application/pdf,image/jpeg,image/png');
  readonly maxMb = input(2);
  readonly hint = input('PDF or JPG, up to 2 MB');

  protected readonly value = signal<UploadedFile | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly disabled = signal(false);

  private onChange: (v: UploadedFile | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: UploadedFile | null): void {
    this.value.set(value ?? null);
    this.error.set(null);
  }

  registerOnChange(fn: (v: UploadedFile | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }

  protected onFile(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    this.onTouched();
    if (!file) return;
    const allowed = this.accept().split(',').map((t) => t.trim());
    if (!allowed.includes(file.type)) {
      this.error.set('This file type is not allowed');
      return;
    }
    if (file.size > this.maxMb() * 1024 * 1024) {
      this.error.set(`File must be ${this.maxMb()} MB or smaller`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const uploaded: UploadedFile = { name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) };
      this.error.set(null);
      this.value.set(uploaded);
      this.onChange(uploaded);
    };
    reader.onerror = () => this.error.set('Could not read the file');
    reader.readAsDataURL(file);
  }

  protected clear(): void {
    this.value.set(null);
    this.onChange(null);
    this.onTouched();
  }
}
