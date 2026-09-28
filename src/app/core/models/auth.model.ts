import { Role } from './common.model';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  username?: string;
  employeeId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  /** true = long-lived token (JWT_REMEMBER_EXPIRES), otherwise a shift-length one (JWT_EXPIRES). */
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  /** e.g. "8h" / "7d" */
  expiresIn?: string;
  user: AuthUser;
}

/** What we persist in localStorage for the session. */
export interface StoredSession {
  token: string;
  user: AuthUser;
  expiresAt: number;
}
