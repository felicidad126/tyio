import { Injectable } from '@nestjs/common';
import type { LoginRequest, SessionUser } from '@tyio/shared';
import { AuditService } from '../../common/audit/audit.service.js';
import { verifyAgainstDummy, verifyPassword } from '../users/password.js';
import { normalizeEmail } from '../users/user-accounts.js';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { type ClientInfo, SessionsService } from './sessions.service.js';

export type LoginResult =
  | { kind: 'ok'; token: string; expiresAt: Date; user: SessionUser }
  | { kind: 'invalid' }
  | { kind: 'locked'; retryAfterSeconds: number };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Email tidak terdaftar, pengguna nonaktif, dan kata sandi salah memberi hasil yang sama
   * (`invalid`) dan memakan waktu kira-kira sama, agar tidak membocorkan akun mana yang ada.
   * Sesi lama di peramban yang sama dicabut saat login baru (mencegah fiksasi sesi).
   */
  async login(input: LoginRequest, client: ClientInfo, previousToken?: string): Promise<LoginResult> {
    const email = normalizeEmail(input.email);

    const wait = await this.throttle.lockedFor(email, client.ip);
    if (wait !== null) return { kind: 'locked', retryAfterSeconds: wait };

    const user = await this.users.findActiveForLogin(email);
    let ok = false;
    if (user) {
      ok = await verifyPassword(input.password, user.passwordHash);
    } else {
      await verifyAgainstDummy(input.password);
    }
    await this.throttle.record(email, client.ip, ok);
    const details = { user_agent: client.userAgent?.slice(0, 512) ?? null };
    if (!user || !ok) {
      // Email yang dicoba ikut dicatat agar percobaan menebak akun terlihat di audit.
      await this.audit.recordEvent('login_failed', { source: 'api', label: email, clientIp: client.ip }, details);
      return { kind: 'invalid' };
    }

    if (previousToken) await this.sessions.revoke(previousToken);
    await this.sessions.purgeExpired();
    await this.throttle.purgeOld();
    const { token, expiresAt } = await this.sessions.create(user.id, client);
    await this.audit.recordEvent(
      'login',
      { source: 'api', userId: user.id, label: user.email, clientIp: client.ip },
      details,
    );
    return { kind: 'ok', token, expiresAt, user: await this.users.toSessionUser(user) };
  }

  /** Pengguna aktif pemilik sesi yang masih berlaku, atau `null`. */
  async authenticate(token: string): Promise<User | null> {
    const session = await this.sessions.touch(token);
    if (!session) return null;
    const user = await this.users.findActiveById(session.userId);
    if (!user) {
      await this.sessions.revoke(token);
      return null;
    }
    return user;
  }

  /** Dicatat di audit hanya bila sesi itu memang masih ada. */
  async logout(token: string, client: ClientInfo): Promise<void> {
    const owner = await this.sessions.revoke(token);
    if (!owner) return;
    await this.audit.recordEvent(
      'logout',
      { source: 'api', userId: owner.userId, label: owner.email, clientIp: client.ip },
      { user_agent: client.userAgent?.slice(0, 512) ?? null },
    );
  }

  toSessionUser(user: User): Promise<SessionUser> {
    return this.users.toSessionUser(user);
  }
}
