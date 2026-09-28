import { BankPaymentMode, PagedResult, Timestamped } from './common.model';

export type SalaryPaymentStatus = 'PENDING' | 'PAID';

export interface SalaryPayment extends Timestamped {
  id: string;
  /** yyyy-MM — one record per employee per month. */
  month: string;
  employeeId: string;
  empCode: string;
  employeeName: string;
  workingDays: number;
  daysPresent: number;
  gross: number;
  bonus: number;
  advanceDeduction: number;
  otherDeductions: number;
  deductionReason: string;
  /** gross + bonus − advance − other deductions */
  net: number;
  /** yyyy-MM-dd */
  paymentDate: string | null;
  paymentMode: BankPaymentMode | null;
  status: SalaryPaymentStatus;
}

/** Totals over every record matching the list filters. */
export interface SalaryPaymentTotals {
  records: number;
  gross: number;
  bonus: number;
  advanceDeduction: number;
  otherDeductions: number;
  net: number;
  paid: number;
  pending: number;
}

export interface SalaryPaymentPage extends PagedResult<SalaryPayment> {
  totals: SalaryPaymentTotals;
}

export type SalaryPaymentSave =Omit<SalaryPayment, 'id' | 'empCode' | 'employeeName' | 'createdAt' | 'updatedAt'>;
