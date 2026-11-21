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
export { AUDIT_ACTIONS, AUDIT_PAGE_DEFAULT, AUDIT_PAGE_MAX, AUDIT_SOURCES } from './audit.js';
export type { AuditAction, AuditEntry, AuditPage, AuditSource } from './audit.js';
export {
  MASTER_CODE_PATTERN,
  MASTER_KIND_LABELS,
  MASTER_KINDS,
  MASTER_KINDS_WITH_CODE,
  MASTER_NAME_MAX_LENGTH,
  isMasterKind,
} from './master.js';
export type {
  CreateCustomer,
  CreateMasterValue,
  CustomerRecord,
  MasterKind,
  MasterValue,
  UpdateCustomer,
  UpdateMasterValue,
} from './master.js';
export {
  REMOTE_IMPORT_MAX_BYTES,
  REMOTE_IMPORT_MAX_ROWS,
  REMOTE_PAGE_SIZE_DEFAULT,
  REMOTE_PAGE_SIZE_MAX,
  REMOTE_ZONE_IANA,
  REMOTE_ZONE_UTC_OFFSET,
  REMOTE_ZONES,
  XLSX_MIME,
} from './remotes.js';
export type {
  RemoteContact,
  RemoteDetail,
  RemoteImportFailure,
  RemoteImportReport,
  RemotePage,
  RemoteSummary,
  RemoteZone,
} from './remotes.js';
export {
  NPR_NUMBER_PATTERN,
  OPEN_TICKET_STATUSES,
  TICKET_DESCRIPTION_MAX_LENGTH,
  TICKET_STARTED_CLOCK_SKEW_MINUTES,
  TICKET_STARTED_MAX_AGE_DAYS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
} from './tickets.js';
export type { CreateTicket, OpenTicketsConflict, TicketDetail, TicketStatus, TicketSummary } from './tickets.js';
