import { Status, Timestamped } from './common.model';

export interface EmployeeType extends Timestamped {
  id: string;
  name: string;
  description: string;
  canLogin: boolean;
  status: Status;
}

export type EmployeeTypeSave = Pick<EmployeeType, 'name' | 'description' | 'canLogin' | 'status'>;
