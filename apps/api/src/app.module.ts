import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from './config.js';
import { dataSourceOptions } from './db/options.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({})
export class AppModule {
  /** Konfigurasi diberikan dari luar (main.ts atau uji), bukan dibaca modul dari env. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl)),
        AuthModule,
        HealthModule,
      ],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
