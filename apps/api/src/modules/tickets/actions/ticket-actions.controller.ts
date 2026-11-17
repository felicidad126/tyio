import {
  type ArgumentsHost,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  type AddTicketActionResponse,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  type SessionUser,
  type TicketActionsResponse,
  type TicketResponse,
} from '@tyio/shared';
import type { Response } from 'express';
import type { Actor } from '../../../common/audit/actor.js';
import type { TenantAccess } from '../../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../../common/tenant/tenant-policy.js';
import { CurrentActor, CurrentUser, RequireModule } from '../../auth/auth.decorators.js';
import { parseActionInput, parseCustomerTicketNumber, type UploadedFile } from './action-input.js';
import { TicketActionsService } from './ticket-actions.service.js';

/** Pesan galat unggah dari multer (bahasa Inggris) diganti pesan untuk pengguna. */
const UPLOAD_MESSAGES: Record<string, string> = {
  'File too large': 'Lampiran lebih dari 5 MB.',
  'Too many files': `Paling banyak ${ATTACHMENT_MAX_FILES} lampiran per tindakan.`,
  'Unexpected field': 'Bagian isian tidak dikenal; lampiran dikirim di bagian "lampiran".',
};

@Catch(HttpException)
class UploadErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = exception.getResponse();
    const message = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : body;
    const translated = typeof message === 'string' ? UPLOAD_MESSAGES[message] : undefined;
    res
      .status(exception.getStatus())
      .json(translated ? { statusCode: exception.getStatus(), message: translated, field: 'lampiran' } : body);
  }
}

/** Linimasa tiket: tindakan, perubahan status, koreksi, lampiran, dan nomor tiket customer. */
@TenantScoped()
@RequireModule('tiket')
@Controller()
export class TicketActionsController {
  constructor(private readonly actions: TicketActionsService) {}

  @Get('tickets/:id/actions')
  async list(
    @CurrentTenantAccess() access: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketActionsResponse> {
    return { actions: await this.actions.list(access, id) };
  }

  @Post('tickets/:id/actions')
  @UseFilters(UploadErrorFilter)
  @UseInterceptors(
    FilesInterceptor('lampiran', ATTACHMENT_MAX_FILES, {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: ATTACHMENT_MAX_FILES, fields: 1, fieldSize: 64 * 1024 },
    }),
  )
  async add(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @UploadedFiles() files: UploadedFile[] | undefined,
  ): Promise<AddTicketActionResponse> {
    const uploads = files ?? [];
    return this.actions.add(access, user.id, id, parseActionInput(body, uploads), uploads, actor);
  }

  @Patch('tickets/:id')
  async update(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<TicketResponse> {
    const number = parseCustomerTicketNumber(body);
    return { ticket: await this.actions.setCustomerTicketNumber(access, user.id, id, number, actor) };
  }

  /**
   * Unduh lampiran. Jenis berkas dari isinya saat diunggah; header menjaga agar berkas tidak
   * dijalankan sebagai halaman (nosniff, CSP sandbox). PDF selalu diunduh, gambar boleh tampil.
   */
  @Get('attachments/:id')
  async download(
    @CurrentTenantAccess() access: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.actions.attachment(access, id);
    const disposition = row.contentType === 'application/pdf' ? 'attachment' : 'inline';
    const ascii = row.fileName.replace(/[^\x20-\x7e]/g, '_');
    res.status(HttpStatus.OK).set({
      'Content-Type': row.contentType,
      'Content-Length': String(row.sizeBytes),
      'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=300',
    });
    this.actions.openAttachment(row).on('error', () => res.destroy()).pipe(res);
  }
}
