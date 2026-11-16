import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginRequest, SessionUser } from '@tyio/shared';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { LoginThrottleService, usernameKey } from './login-throttle.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { SessionService } from './session.service.js';

export class TooManyLoginAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Terlalu banyak percobaan masuk. Coba lagi dalam ${minutes} menit.`,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// Satu pesan untuk semua penolakan (sandi salah, pengguna tak dikenal, nonaktif),
// agar jawaban tidak membocorkan nama pengguna mana yang ada.
const REJECTED = {
  statusCode: HttpStatus.UNAUTHORIZED,
  message: 'Nama pengguna atau kata sandi tidak cocok.',
};

// Pengguna tak dikenal tetap melewati satu verifikasi argon2, supaya waktu jawabnya
// setara dengan kata sandi salah.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async login(
    input: LoginRequest,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: string; user: SessionUser }> {
    const username = input.username.trim().toLowerCase();
    const key = usernameKey(username);

    const wait = await this.throttle.retryAfterSeconds(key, meta.ip);
    if (wait > 0) throw new TooManyLoginAttemptsException(wait);

    const user = await this.users.findByUsername(username);
    const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !passwordOk || !user.active) {
      await this.throttle.recordFailure(key, meta.ip);
      throw new UnauthorizedException(REJECTED);
    }

    await this.throttle.clear(key);
    const token = await this.sessions.create(user.id, meta);
    return { token, user: await this.users.toSessionUser(user) };
  }
}
