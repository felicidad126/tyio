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
  RemoteMap,
  RemoteMapPoint,
  RemoteImportFailure,
  RemoteImportReport,
  RemotePage,
  RemoteSummary,
  RemoteZone,
} from './remotes.js';
export {
  CUSTOMER_TICKET_NUMBER_MAX_LENGTH,
  NPR_NUMBER_PATTERN,
  OPEN_TICKET_STATUSES,
  PENDING_TICKET_STATUSES,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  TICKET_PAGE_SIZE_DEFAULT,
  TICKET_PAGE_SIZE_MAX,
  QUEUE_DATE_PATTERN,
  TICKET_QUEUE_SORTS,
  TICKET_QUEUE_STATUS_ALL,
  TICKET_QUEUE_VIEW_LABELS,
  TICKET_QUEUE_VIEWS,
  TICKET_ACTION_KIND_LABELS,
  TICKET_ACTION_KINDS,
  TICKET_ACTION_KINDS_SELECTABLE,
  TICKET_ACTION_NOTE_MAX_LENGTH,
  TICKET_CLOSE_CAUSE_LABELS,
  TICKET_CLOSE_CAUSES,
  TICKET_RESOLUTION_MAX_LENGTH,
  REMOTE_HISTORY_PAGE_SIZE_DEFAULT,
  REMOTE_HISTORY_PAGE_SIZE_MAX,
  TICKET_ATTACHMENT_ACCEPT,
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_NAME_MAX_LENGTH,
  TICKET_ATTACHMENT_TYPES,
  TICKET_ATTACHMENTS_PER_ACTION,
  TICKET_DESCRIPTION_MAX_LENGTH,
  TICKET_PENDING_REASON_MAX_LENGTH,
  TICKET_STARTED_CLOCK_SKEW_MINUTES,
  TICKET_STARTED_MAX_AGE_DAYS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  TROUBLE_TICKET_CONTACT_MAX_LENGTH,
  TROUBLE_TICKET_PROBLEM_MAX_LENGTH,
  TROUBLE_TICKET_STATUS_LABELS,
  TROUBLE_TICKET_STATUSES,
  TT_NUMBER_PATTERN,
  isTicketActionKind,
  isTicketCloseCause,
  isTicketStatus,
  isTicketTransitionAllowed,
  selectableNextStatuses,
} from './tickets.js';
export type {
  CloseTicket,
  CloseTroubleTicket,
  CreateTicket,
  CreateTicketAction,
  CreateTroubleTicket,
  GlobalSearchResult,
  OpenTicketsConflict,
  RemoteTicketHistoryItem,
  RemoteTicketHistoryPage,
  SearchRemoteHit,
  SearchTicketHit,
  SearchTroubleTicketHit,
  TakeTicket,
  TicketPerson,
  TicketQueueFilter,
  TicketQueueItem,
  TicketQueuePage,
  TicketQueueSort,
  TicketQueueStatusFilter,
  TicketQueueView,
  TicketAction,
  TicketActionKind,
  TicketAttachment,
  TicketCloseCause,
  TicketClosure,
  TicketDetail,
  TicketStatus,
  TicketSummary,
  TicketTimeline,
  TroubleTicket,
  TroubleTicketClosure,
  TroubleTicketCopied,
  TroubleTicketPage,
  TroubleTicketQueueItem,
  TroubleTicketStatus,
} from './tickets.js';
export {
  REMOTE_REGION_OTHER,
  REMOTE_REGION_PROVINCES,
  REMOTE_REGIONS,
  isRemoteRegion,
  provinceKey,
  remoteRegionOf,
} from './regions.js';
export type { RemoteRegion } from './regions.js';
export {
  OVERVIEW_DAY_ZONE,
  OVERVIEW_DAY_ZONE_IANA,
  OVERVIEW_FREQUENT_LIMIT,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  OVERVIEW_URGENT_LIMIT,
  isOverviewPeriod,
} from './overview.js';
export type { Overview, OverviewCount, OverviewDaily, OverviewDay, OverviewPeriod, OverviewRemote } from './overview.js';
export { STREAM_EVENTS } from './stream.js';
export type { StreamBeat, StreamHello, TicketChangeEvent } from './stream.js';
