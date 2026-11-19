export const APP_NAME = 'Portal NOC Terpusat';

/** Semua endpoint API berada di bawah prefix ini; sisanya milik aplikasi web. */
export const API_PREFIX = 'api';

export type { HealthResponse, HealthState } from './health.js';
export {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ROLE_LABELS,
  ROLES,
  isRole,
} from './auth.js';
export type { LoginRequest, Role, SessionUser, TenantSummary } from './auth.js';
