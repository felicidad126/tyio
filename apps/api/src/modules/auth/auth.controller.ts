import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  type LoginRequest,
  type SessionUser,
} from '@tyio/shared';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../config.module.js';
import type { AppConfig } from '../../config.js';
import type { User } from '../users/user.entity.js';
import { clientInfo, CurrentUser, Public } from './auth-request.js';
import { AuthService } from './auth.service.js';
import { readCookie, SESSION_COOKIE, sessionCookieOptions } from './cookies.js';

export const INVALID_LOGIN_MESSAGE = 'Email atau kata sandi salah.';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** 200 + cookie sesi; 401 untuk email/kata sandi salah; 429 + Retry-After bila dikunci. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<SessionUser> {
    if (!request.is('application/json')) {
      throw new UnsupportedMediaTypeException('Kirim data login sebagai JSON.');
    }
    const input = parseLoginRequest(body);
    const result = await this.auth.login(
      input,
      clientInfo(request),
      readCookie(request.headers.cookie, SESSION_COOKIE),
    );

    if (result.kind === 'locked') {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      throw new HttpException(
        `Terlalu banyak percobaan masuk yang gagal. Coba lagi dalam ${minutes} menit.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.kind === 'invalid') {
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    response.cookie(
      SESSION_COOKIE,
      result.token,
      sessionCookieOptions(this.config.session.cookieSecure, result.expiresAt),
    );
    return result.user;
  }

  /** Selalu 204 dan menghapus cookie, juga bila sesi sudah berakhir. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) await this.auth.logout(token);
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.config.session.cookieSecure));
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: User): Promise<SessionUser> {
    return this.auth.toSessionUser(user);
  }
}

function parseLoginRequest(body: unknown): LoginRequest {
  const { email, password } = (body ?? {}) as Partial<Record<keyof LoginRequest, unknown>>;
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.trim() === '' ||
    password === '' ||
    email.length > EMAIL_MAX_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException('Email dan kata sandi wajib diisi.');
  }
  return { email, password };
}
