import { Pipe, PipeTransform } from '@angular/core';
import { formatINR } from '../../core/utils/format.util';

/** `{{ 1234.5 | inr }}` → ₹1,234.50 · `{{ 1234.5 | inr: true }}` → ₹1,235 */
@Pipe({ name: 'inr' })
export class InrCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined, wholeRupees = false): string {
    return formatINR(value, wholeRupees);
  }
}
