import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../../common/audit/audit.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { RolesGuard } from './roles.guard.js';
import { SameOriginGuard } from './same-origin.guard.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    LoginThrottleService,
    // Urutan penting: tolak permintaan lintas situs dulu, lalu periksa sesi, lalu peran.
    { provide: APP_GUARD, useClass: SameOriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // Aliran pembaruan langsung (2.2) memeriksa ulang sesi di setiap detak.
  exports: [AuthService],
})
export class AuthModule {}
