export type UserRole = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'SELLER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

// Base user
export interface User {
  full_name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  experience?: string | null;
  education_background?: string | null;
  branch_id?: string | null;
}

// Create
export interface UserCreate extends User {
  password: string;
}

// Update
export interface UserUpdate {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: UserRole | null;
  experience?: string | null;
  education_background?: string | null;
  branch_id?: string | null;
}

// API response (never includes the password)
export interface UserResponse {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: UserStatus;
  branch_id?: string | null;
  created_at: string;
}

export interface UserListResponse {
  items: UserResponse[];
  total: number;
}

export interface AdminResetPasswordRequest {
  new_password: string;
}

export interface StatusUpdate {
  status: UserStatus;
}

// The signed-in user, as returned by /auth/login and /auth/refresh
export type SessionUser = Pick<UserResponse, 'email' | 'full_name' | 'role'> &
  Partial<Pick<UserResponse, 'id' | 'branch_id' | 'status'>>;

// Staff detail page
export interface UserDetail extends UserResponse {
  experience?: string | null;
  education_background?: string | null;
  updated_at: string;
  active_sessions: number;
  last_active_at?: string | null;
}

export interface UserSession {
  id: string;
  device_name?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  last_used_at?: string | null;
  created_at: string;
  expires_at: string;
}

export interface RevokeResult {
  message: string;
  revoked: number;
}

export interface MessageResponse {
  message: string;
}