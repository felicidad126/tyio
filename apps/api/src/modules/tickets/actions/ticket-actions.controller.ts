import {
  BadRequestException,
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  Header,
  HttpException,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  CUSTOMER_TICKET_NUMBER_MAX_LENGTH,
  isTicketActionKind,
  isTicketStatus,
  TICKET_ACTION_NOTE_MAX_LENGTH,
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENTS_PER_ACTION,
  TICKET_PENDING_REASON_MAX_LENGTH,
  type TicketAction,
  type TicketTimeline,
} from '@tyio/shared';
import type { Request, Response } from 'express';
import { catchError, defer, mergeMap, type Observable, throwError } from 'rxjs';
import type { AuditActor } from '../../../common/audit/audit-context.js';
import { CurrentScope, TenantScoped } from '../../../common/tenant/tenancy.js';
import type { TenantScope } from '../../../common/tenant/tenant-scope.js';
import { CurrentActor, CurrentUser } from '../../auth/auth-request.js';
import { isUuid, readBody } from '../../master/master-input.js';
import type { User } from '../../users/user.entity.js';
import { TICKET_NOT_FOUND_MESSAGE, TicketsService } from '../tickets.service.js';
import { checkAttachment, type UploadedPart } from './attachment-file.js';
import {
  type AddActionInput,
  ATTACHMENT_NOT_FOUND_MESSAGE,
  isPendingStatus,
  TicketActionsService,
} from './ticket-actions.service.js';

const UPLOAD_FIELD = 'lampiran';

/**
 * Unggahan multipart (bagian `data` = JSON tindakan, bagian `lampiran` = berkas) lewat
 * interceptor multer bawaan Nest, disimpan di memori lalu ke database (T70). Galat unggah
 * (berkas terlalu besar, terlalu banyak, bagian tak dikenal) dijawab dalam bahasa Indonesia.
 * Permintaan JSON biasa dilewatkan apa adanya.
 */
@Injectable()
class AttachmentUploadInterceptor implements NestInterceptor {
  private readonly upload = new (FilesInterceptor(UPLOAD_FIELD, TICKET_ATTACHMENTS_PER_ACTION, {
    // Peramban mengirim nama berkas sebagai UTF-8 tanpa charset; bawaan multer latin1.
    defParamCharset: 'utf8',
    limits: {
      fileSize: TICKET_ATTACHMENT_MAX_BYTES,
      files: TICKET_ATTACHMENTS_PER_ACTION,
      fields: 1,
      fieldSize: 64 * 1024,
      parts: TICKET_ATTACHMENTS_PER_ACTION + 1,
    },
  }))();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    let uploaded = false;
    const handler: CallHandler = {
      handle: () => {
        uploaded = true;
        return next.handle();
      },
    };
    return defer(async () => this.upload.intercept(context, handler)).pipe(
      mergeMap((result) => result),
      catchError((error: unknown) => throwError(() => (uploaded ? error : uploadError(error)))),
    );
  }
}

function uploadError(error: unknown): unknown {
  if (!(error instanceof HttpException)) return error;
  const message = String(error.message);
  if (error.getStatus() === 413 || /too large/i.test(message)) {
    return new BadRequestException('Berkas paling besar 10 MB.');
  }
  if (/too many files|unexpected field/i.test(message)) {
    return new BadRequestException(`Paling banyak ${TICKET_ATTACHMENTS_PER_ACTION} lampiran per tindakan.`);
  }
  return new BadRequestException('Unggahan tidak bisa dibaca. Kirim tindakan di bagian data dan berkas di bagian lampiran.');
}

/**
 * Linimasa NPR (langkah 1.4). Semua peran membaca dan menambah tindakan untuk NPR dalam
 * cakupannya; NPR di luar cakupan dijawab 404 (T29).
 */
@Controller('tickets/:ticketId')
@TenantScoped()
export class TicketActionsController {
  constructor(
    private readonly actions: TicketActionsService,
    private readonly tickets: TicketsService,
  ) {}

  @Get('actions')
  @Header('Cache-Control', 'no-store')
  async list(@CurrentScope() scope: TenantScope, @Param('ticketId') ticketId: string): Promise<TicketAction[]> {
    const actions = isUuid(ticketId) ? await this.actions.list(scope, ticketId.toLowerCase()) : null;
    if (!actions) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    return actions;
  }

  /**
   * Tambah tindakan: JSON `CreateTicketAction`, atau multipart dengan bagian `data` (JSON yang
   * sama) dan sampai 5 berkas di bagian `lampiran`. Jawaban: NPR terbaru dan linimasanya.
   */
  @Post('actions')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(AttachmentUploadInterceptor)
  async add(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @CurrentUser() user: User,
    @Param('ticketId') ticketId: string,
    @Req() request: Request & { files?: UploadedPart[] },
  ): Promise<TicketTimeline> {
    if (!isUuid(ticketId)) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    const id = ticketId.toLowerCase();
    const input = readAction(request);
    await this.actions.add(scope, actor, user.role, id, input);
    const [ticket, actions] = await Promise.all([this.tickets.get(scope, id), this.actions.list(scope, id)]);
    if (!ticket || !actions) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    return { ticket, actions };
  }

  /** Unduh lampiran. Gambar ditampilkan di peramban, jenis lain selalu diunduh. */
  @Get('attachments/:attachmentId')
  async attachment(
    @CurrentScope() scope: TenantScope,
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file =
      isUuid(ticketId) && isUuid(attachmentId)
        ? await this.actions.attachment(scope, ticketId.toLowerCase(), attachmentId.toLowerCase())
        : null;
    if (!file) throw new NotFoundException(ATTACHMENT_NOT_FOUND_MESSAGE);
    const inline = file.contentType.startsWith('image/');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Isi berkas tidak pernah dijalankan sebagai halaman, walau dibuka langsung.
    response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    return new StreamableFile(file.content, {
      type: file.contentType.startsWith('text/') ? `${file.contentType}; charset=utf-8` : file.contentType,
      length: file.content.length,
      disposition: contentDisposition(inline ? 'inline' : 'attachment', file.fileName),
    });
  }
}

/** `filename` ASCII sebagai cadangan dan `filename*` UTF-8 (RFC 6266). */
function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const ACTION_FIELDS = [
  'kind',
  'note',
  'occurredAt',
  'statusTo',
  'statusFrom',
  'pendingReason',
  'correctsId',
  'startedAt',
  'customerTicketNumber',
] as const;

/** Zona wajib ditulis (`Z` atau `+08:00`), agar waktu tidak ditafsirkan menurut jam server. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function readAction(request: Request & { files?: UploadedPart[] }): AddActionInput {
  const files = request.files ?? [];
  let body: unknown = request.body;
  if (request.is('multipart/form-data')) {
    const data = (body as Record<string, unknown> | undefined)?.data;
    if (typeof data !== 'string') throw new BadRequestException('Bagian data (JSON tindakan) wajib dikirim.');
    try {
      body = JSON.parse(data);
    } catch {
      throw new BadRequestException('Bagian data harus JSON yang sah.');
    }
  }
  const record = readBody(body, ACTION_FIELDS);

  const kind = record.kind;
  if (!isTicketActionKind(kind) || kind === 'dibuat') {
    throw new BadRequestException('Pilih jenis tindakan: cek jaringan, cek lokasi, hubungi customer, catatan, atau koreksi.');
  }
  const note = readText(record.note, 'Catatan', TICKET_ACTION_NOTE_MAX_LENGTH);
  if (note === null) throw new BadRequestException('Catatan wajib diisi.');

  const statusTo = record.statusTo ?? null;
  if (statusTo !== null && !isTicketStatus(statusTo)) throw new BadRequestException('Status tujuan tidak dikenal.');
  const statusFrom = record.statusFrom ?? null;
  if (statusFrom !== null && !isTicketStatus(statusFrom)) throw new BadRequestException('Status asal tidak dikenal.');
  if (statusTo !== null && statusFrom === null) {
    throw new BadRequestException('statusFrom (status yang terlihat saat mengisi) wajib dikirim bersama statusTo.');
  }

  const pendingReason = readText(record.pendingReason, 'Alasan pending', TICKET_PENDING_REASON_MAX_LENGTH);
  if (isPendingStatus(statusTo)) {
    if (pendingReason === null) throw new BadRequestException('Alasan pending wajib diisi.');
  } else if (pendingReason !== null) {
    throw new BadRequestException('Alasan pending hanya diisi bila status menjadi pending.');
  }

  let correctsId: string | null = null;
  if (kind === 'koreksi') {
    if (!isUuid(record.correctsId)) throw new BadRequestException('Pilih entri yang dikoreksi.');
    correctsId = record.correctsId.toLowerCase();
  } else if (record.correctsId !== undefined && record.correctsId !== null) {
    throw new BadRequestException('Entri yang dikoreksi hanya diisi untuk tindakan koreksi.');
  }

  const startedAt = readTime(record.startedAt, 'Mulai gangguan');
  if (startedAt && kind !== 'koreksi') {
    throw new BadRequestException('Mulai gangguan hanya bisa diubah lewat tindakan koreksi.');
  }

  let customerTicketNumber: string | null = null;
  if (record.customerTicketNumber !== undefined && record.customerTicketNumber !== null) {
    if (typeof record.customerTicketNumber !== 'string') {
      throw new BadRequestException('Nomor tiket customer harus berupa teks.');
    }
    customerTicketNumber = record.customerTicketNumber.trim();
    if (customerTicketNumber.length > CUSTOMER_TICKET_NUMBER_MAX_LENGTH) {
      throw new BadRequestException(`Nomor tiket customer paling panjang ${CUSTOMER_TICKET_NUMBER_MAX_LENGTH} karakter.`);
    }
  }

  return {
    kind,
    note,
    occurredAt: readTime(record.occurredAt, 'Waktu kejadian'),
    statusTo,
    statusFrom,
    pendingReason,
    correctsId,
    startedAt,
    customerTicketNumber,
    attachments: files.map(checkAttachment),
  };
}

function readText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${label} harus berupa teks.`);
  const text = value.trim();
  if (text === '') return null;
  if (text.length > max) throw new BadRequestException(`${label} paling panjang ${max} karakter.`);
  return text;
}

function readTime(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'string' && ISO_WITH_ZONE.test(value) ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} harus berupa tanggal dan jam yang sah.`);
  }
  return parsed;
}
