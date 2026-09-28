import { Status, Timestamped } from './common.model';

export interface Unit extends Timestamped {
  id: string;
  name: string;
  shortCode: string;
  allowDecimal: boolean;
  status: Status;
}

export type UnitSave = Pick<Unit, 'name' | 'shortCode' | 'allowDecimal' | 'status'>;
