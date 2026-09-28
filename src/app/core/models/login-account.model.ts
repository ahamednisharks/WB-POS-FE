import { Role, Timestamped } from './common.model';

export type LoginStatus = 'ACTIVE' | 'BLOCKED';

export interface LoginAccount extends Timestamped {
  id: string;
  employeeId: string;
  empCode: string;
  employeeName: string;
  username: string;
  role: Role;
  status: LoginStatus;
  /** ISO date-time, read-only. */
  lastLogin: string | null;
}

export interface LoginAccountCreate {
  employeeId: string;
  username: string;
  password: string;
  role: Role;
  status: LoginStatus;
}

export type LoginAccountUpdate = Pick<LoginAccount, 'username' | 'role' | 'status'>;

export interface ResetPasswordRequest {
  password: string;
}

export interface BlockRequest {
  blocked: boolean;
}
