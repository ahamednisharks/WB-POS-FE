import { Timestamped, UploadedFile } from './common.model';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type EmployeeStatus = 'ACTIVE' | 'RESIGNED';

export interface Employee extends Timestamped {
  id: string;
  empCode: string;
  photo: string | null;
  fullName: string;
  employeeTypeId: string;
  employeeTypeName: string;
  mobile: string;
  altMobile: string;
  email: string;
  gender: Gender;
  /** yyyy-MM-dd */
  dob: string | null;
  /** yyyy-MM-dd */
  joiningDate: string;
  address: string;
  /** 12 digits; display masked. */
  aadhaar: string;
  idProof: UploadedFile | null;
  emergencyName: string;
  emergencyMobile: string;
  bankAccount: string;
  ifsc: string;
  status: EmployeeStatus;
  /** yyyy-MM-dd, only when RESIGNED. */
  resignDate: string | null;
}

export type EmployeeSave = Omit<Employee, 'id' | 'empCode' | 'employeeTypeName' | 'createdAt' | 'updatedAt'>;
