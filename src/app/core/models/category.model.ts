import { Status, Timestamped } from './common.model';

export interface Category extends Timestamped {
  id: string;
  name: string;
  /** Data URL or remote URL. */
  image: string | null;
  displayOrder: number;
  status: Status;
  /** Computed by the backend. */
  itemCount: number;
}

export type CategorySave = Pick<Category, 'name' | 'image' | 'displayOrder' | 'status'>;
