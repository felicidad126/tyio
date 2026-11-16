import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from './config.js';
import { dataSourceOptions } from './db/options.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({})
export class AppModule {
  /** Konfigurasi diberikan dari luar (main.ts atau uji), bukan dibaca modul dari env. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl)), HealthModule],
    };
  }
}
