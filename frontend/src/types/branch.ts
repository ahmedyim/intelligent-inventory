export type BranchStatus = 'ACTIVE' | 'INACTIVE';

// Exactly what the backend sends
export interface BranchRead {
  id: string;
  name: string;
  location: string;
  email?: string | null;
  phone?: string | null;
  status?: BranchStatus;  // not sent yet
  is_active?: boolean;    // accepted too, in case you add this column instead
  created_at: string;
  updated_at: string;
}

export interface BranchList {
  items: BranchRead[];
  total: number;
}

// What the pages use: status is always present
export interface Branch extends Omit<BranchRead, 'status' | 'is_active'> {
  status: BranchStatus;
}

export type BranchCreate = Pick<Branch, 'name' | 'location' | 'email' | 'phone'>;

export type BranchUpdate = Partial<BranchCreate> & { status?: BranchStatus };