import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Lapis kedua melawan CSRF, di samping cookie SameSite=Strict: permintaan yang mengubah
 * data harus berasal dari origin yang sama dengan API (aplikasi web dilayani dari origin
 * yang sama, T13). Klien non-peramban (curl, skrip) tidak mengirim kedua header ini dan
 * tetap dilayani; peramban selalu mengirimnya pada permintaan lintas situs.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const fetchSite = request.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      throw new ForbiddenException('Permintaan dari situs lain ditolak.');
    }

    const origin = request.get('origin');
    if (origin !== undefined && !isSameHost(origin, request.host)) {
      throw new ForbiddenException('Permintaan dari situs lain ditolak.');
    }
    return true;
  }
}

/**
 * Membandingkan host (nama + port) dari header Origin dengan host permintaan.
 * `request.host` menghormati X-Forwarded-Host bila `trust proxy` diaktifkan.
 */
function isSameHost(origin: string, requestHost: string | undefined): boolean {
  if (!requestHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost.toLowerCase();
  } catch {
    // Termasuk Origin "null" (dokumen sandbox, berkas lokal).
    return false;
  }
}
