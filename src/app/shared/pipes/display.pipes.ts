import { Pipe, PipeTransform } from '@angular/core';
import { displayDate, displayDateTime, displayTime, monthLabel } from '../../core/utils/date.util';
import { formatQty, maskAadhaar, titleCase } from '../../core/utils/format.util';

/** yyyy-MM-dd or ISO → dd-MM-yyyy (IST) */
@Pipe({ name: 'istDate' })
export class IstDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return displayDate(value);
  }
}

/** ISO → dd-MM-yyyy hh:mm AM (IST) */
@Pipe({ name: 'istDateTime' })
export class IstDateTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return displayDateTime(value);
  }
}

/** ISO → hh:mm AM (IST) */
@Pipe({ name: 'istTime' })
export class IstTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return displayTime(value);
  }
}

/** yyyy-MM → Sep 2026 */
@Pipe({ name: 'monthLabel' })
export class MonthLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? monthLabel(value) : '';
  }
}

/** 0.5 → 0.5, 2 → 2, 1234.5 → 1,234.5 */
@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatQty(value);
  }
}

/** PARTLY_PAID → Partly Paid */
@Pipe({ name: 'enumLabel' })
export class EnumLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return titleCase(value);
  }
}

/** 123456789012 → XXXX XXXX 9012 */
@Pipe({ name: 'aadhaarMask' })
export class AadhaarMaskPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return maskAadhaar(value);
  }
}
