import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './common/audit/audit.module.js';
import { ConfigModule } from './config.module.js';
import type { AppConfig } from './config.js';
import { dataSourceOptions } from './db/options.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MasterModule } from './modules/master/master.module.js';
import { RemotesModule } from './modules/remotes/remotes.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({})
export class AppModule {
  /** Konfigurasi diberikan dari luar (main.ts atau uji), bukan dibaca modul dari env. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl)),
        HealthModule,
        TenantsModule,
        UsersModule,
        AuthModule,
        AuditModule,
        MasterModule,
        RemotesModule,
      ],
    };
  }
}
