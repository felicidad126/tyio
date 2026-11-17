export const APP_NAME = 'Portal NOC Terpusat';

/** Semua endpoint API berada di bawah prefix ini; sisanya milik aplikasi web. */
export const API_PREFIX = 'api';

export { USER_ROLES } from './auth.js';
export type {
  ApiErrorBody,
  LoginRequest,
  SessionResponse,
  SessionUser,
  TenantListResponse,
  TenantRef,
  TenantResponse,
  TenantScope,
  UserRole,
} from './auth.js';
export type { HealthResponse, HealthState } from './health.js';
export { APP_MODULES, canOpenModule, MODULE_ROLES } from './modules.js';
export type { AppModule } from './modules.js';
