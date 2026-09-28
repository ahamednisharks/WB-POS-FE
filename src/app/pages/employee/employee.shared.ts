import { ValidatorFn } from '@angular/forms';
import {
  EmployeeStatus,
  Gender,
  LoginStatus,
  Option,
  Role,
  SalaryPaymentStatus,
  SalaryType,
} from '../../core/models';
import { ageInYears, dateToStr, daysInMonth, todayIST } from '../../core/utils/date.util';

// ------------------------------------------------------------------ options
export const GENDER_OPTIONS: Option<Gender>[] = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'OTHER' },
];

export const EMPLOYEE_STATUS_OPTIONS: Option<EmployeeStatus>[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Resigned', value: 'RESIGNED' },
];

export const SALARY_TYPE_OPTIONS: Option<SalaryType>[] = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Daily', value: 'DAILY' },
];

export const PAYMENT_STATUS_OPTIONS: Option<SalaryPaymentStatus>[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Paid', value: 'PAID' },
];

export const ROLE_OPTIONS: Option<Role>[] = [
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Cashier', value: 'CASHIER' },
];

export const LOGIN_STATUS_OPTIONS: Option<LoginStatus>[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Blocked', value: 'BLOCKED' },
];

// --------------------------------------------------------------- validators
/** Date (p-datepicker value) must not be after today (IST). Error key: `future`. */
export const notFutureDate: ValidatorFn = (c) => {
  const s = dateToStr(c.value as Date | null);
  return s && s > todayIST() ? { future: true } : null;
};

/** Birth date must make the person at least `years` old. Error key: `minAge`. */
export function minAge(years: number): ValidatorFn {
  return (c) => {
    const s = dateToStr(c.value as Date | null);
    return s && ageInYears(s) < years ? { minAge: { years } } : null;
  };
}

/** Group validator: `password` and `confirmPassword` must match. Error key (on the group): `mismatch`. */
export const passwordsMatch: ValidatorFn = (g) => {
  const pw = g.get('password');
  const confirm = g.get('confirmPassword');
  if (!pw || !confirm || pw.disabled || !confirm.value) return null;
  return pw.value === confirm.value ? null : { mismatch: true };
};

// ------------------------------------------------------------------ helpers
/** Local Date `years` before today (for p-datepicker maxDate). */
export function yearsAgo(years: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

/** Days in a yyyy-MM month excluding Sundays (default working days). */
export function workingDaysIn(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const total = daysInMonth(month);
  let sundays = 0;
  for (let day = 1; day <= total; day++) {
    if (new Date(y, m - 1, day).getDay() === 0) sundays++;
  }
  return total - sundays;
}
