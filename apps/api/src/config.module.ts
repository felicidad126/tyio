import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';

/** Token injeksi untuk konfigurasi aplikasi yang sudah divalidasi. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Menyediakan konfigurasi yang sama ke semua modul tanpa membaca env di dalam modul. */
@Module({})
export class ConfigModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
