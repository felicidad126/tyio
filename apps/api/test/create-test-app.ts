import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { AppConfig } from '../src/config.js';
import { testConfig } from './test-config.js';

/**
 * Aplikasi utuh dengan konfigurasi yang sama seperti `main.ts`, terhubung ke database uji.
 * `imports` tambahan hanya untuk alat uji (mis. DiscoveryModule untuk membaca daftar rute).
 */
export async function createTestApp(
  config: AppConfig = testConfig(),
  options: { imports?: Array<Type | DynamicModule> } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config), ...(options.imports ?? [])],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}
