import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { LoginRequest, SessionResponse, SessionUser } from '@tyio/shared';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { CurrentUser, Public } from './auth.decorators.js';
import { AuthService, TooManyLoginAttemptsException } from './auth.service.js';
import {
  clearSessionCookie,
  readCookie,
  sessionCookieName,
  setSessionCookie,
} from './session-cookie.js';
import { SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const input = parseLoginRequest(body);
    try {
      const { token, user } = await this.auth.login(input, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      setSessionCookie(res, token, this.config);
      return { user };
    } catch (error) {
      if (error instanceof TooManyLoginAttemptsException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  /** Selalu berhasil, juga tanpa sesi, agar tombol Keluar tidak pernah macet. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req.headers.cookie, sessionCookieName(this.config));
    if (token) await this.sessions.revoke(token);
    clearSessionCookie(res, this.config);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionResponse {
    return { user };
  }
}

function parseLoginRequest(body: unknown): LoginRequest {
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  const valid =
    typeof username === 'string' &&
    typeof password === 'string' &&
    username.trim().length > 0 &&
    username.length <= 100 &&
    password.length > 0 &&
    password.length <= 256;
  if (!valid) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Isi nama pengguna dan kata sandi.',
    });
  }
  return { username, password };
}
