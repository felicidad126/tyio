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
export {
  MASTER_CODE_PATTERN,
  MASTER_LABELS,
  MASTER_LISTS,
  MASTER_NAME_MAX,
  MASTER_NAME_MIN,
  masterCodeError,
  masterNameError,
  normalizeMasterCode,
  normalizeMasterName,
} from './master.js';
export type {
  CreateMasterItemRequest,
  MasterItem,
  MasterItemResponse,
  MasterList,
  MasterListResponse,
  UpdateMasterItemRequest,
} from './master.js';
export {
  findProvince,
  PROVINCES,
  REMOTE_IMPORT_COLUMNS,
  REMOTE_IMPORT_FIELDS,
  REMOTE_IMPORT_MAX_ROWS,
  REMOTE_MAX_CONTACTS,
  REMOTE_PAGE_SIZE,
  REMOTE_STATUS_LABELS,
  REMOTE_STATUSES,
  TIME_ZONES,
} from './remotes.js';
export type {
  JarkomRef,
  Province,
  RemoteContact,
  RemoteDetail,
  RemoteImportColumn,
  RemoteImportFailure,
  RemoteImportField,
  RemoteImportRequest,
  RemoteImportResult,
  RemoteImportRow,
  RemoteListQuery,
  RemoteListResponse,
  RemoteResponse,
  RemoteStatus,
  RemoteSummary,
  TimeZoneLabel,
  TimeZoneName,
} from './remotes.js';
export {
  ACTION_NOTE_MAX,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_TYPES,
  canTransition,
  CUSTOMER_TICKET_NUMBER_MAX,
  PENDING_PARTIES,
  PENDING_PARTY_LABELS,
  PENDING_REASON_MAX,
  PENDING_REASON_MIN,
  TICKET_FUTURE_TOLERANCE_MINUTES,
  TICKET_PROBLEM_MAX,
  TICKET_PROBLEM_MIN,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
} from './tickets.js';
export type {
  AddTicketActionRequest,
  AddTicketActionResponse,
  AttachmentType,
  PendingParty,
  TicketAction,
  TicketActionsResponse,
  TicketAttachment,
  UpdateTicketRequest,
  CreateTicketRequest,
  MasterRef,
  OpenTicketsConflict,
  OpenTicketsResponse,
  TicketDetail,
  TicketRemote,
  TicketResponse,
  TicketStatus,
  TicketSummary,
} from './tickets.js';
export {
  formatInZone,
  localInputToUtc,
  TIME_ZONE_OFFSET_MINUTES,
  timeZoneLabel,
  utcToLocalInput,
} from './time.js';
export { APP_MODULES, canOpenModule, MODULE_ROLES } from './modules.js';
export type { AppModule } from './modules.js';
