import type { Response } from 'express';
import type { AppConfig } from '../../config.js';
import { SESSION_ABSOLUTE_MS } from './session.service.js';

const BASE_NAME = 'tyio_sid';

/**
 * Dengan TLS, nama cookie memakai awalan `__Host-`: browser hanya menerimanya bila
 * Secure, Path=/, dan tanpa Domain, sehingga subdomain lain tidak bisa menimpanya.
 */
export function sessionCookieName(config: AppConfig): string {
  return config.sessionCookieSecure ? `__Host-${BASE_NAME}` : BASE_NAME;
}

export function setSessionCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(sessionCookieName(config), token, { ...cookieOptions(config), maxAge: SESSION_ABSOLUTE_MS });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(sessionCookieName(config), cookieOptions(config));
}

/** Nilai satu cookie dari header Cookie, atau undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim() || undefined;
    }
  }
  return undefined;
}

function cookieOptions(config: AppConfig) {
  // SameSite=Lax: cookie tidak ikut pada POST dari situs lain (perlindungan CSRF dasar).
  return { httpOnly: true, sameSite: 'lax', secure: config.sessionCookieSecure, path: '/' } as const;
}
