import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './common/audit/audit.module.js';
import { TenantModule } from './common/tenant/tenant.module.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { dataSourceOptions } from './db/options.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MasterModule } from './modules/master/master.module.js';
import { RemotesModule } from './modules/remotes/remotes.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { TroubleTicketsModule } from './modules/trouble-tickets/trouble-tickets.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';

@Module({})
export class AppModule {
  /** Konfigurasi diberikan dari luar (main.ts atau uji), bukan dibaca modul dari env. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl)),
        AuditModule,
        TenantModule,
        AuthModule,
        HealthModule,
        TenantsModule,
        MasterModule,
        RemotesModule,
        TicketsModule,
        SearchModule,
        TroubleTicketsModule,
      ],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
