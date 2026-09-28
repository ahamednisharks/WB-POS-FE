import { Timestamped } from './common.model';

export type SalaryType = 'MONTHLY' | 'DAILY';

export interface SalarySetup extends Timestamped {
  id: string;
  employeeId: string;
  empCode: string;
  employeeName: string;
  salaryType: SalaryType;
  /** Monthly: salary per month. Daily: wage per day. */
  basicSalary: number;
  /** Fixed monthly allowances. */
  allowances: number;
  /** yyyy-MM-dd */
  effectiveFrom: string;
}

export type SalarySetupSave = Pick<SalarySetup, 'employeeId' | 'salaryType' | 'basicSalary' | 'allowances' | 'effectiveFrom'>;
