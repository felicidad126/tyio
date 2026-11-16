import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { HealthResponse } from '@tyio/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

// Uji lewat HTTP terhadap AppModule utuh (bukan mock), sesuai T11.
// Health controller bergantung pada HealthService lewat injeksi konstruktor,
// jadi uji ini juga membuktikan metadata dekorator ikut terpancar di Vitest.
describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('menjawab 200 dengan status ok dalam JSON', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' } satisfies HealthResponse);
  });

  it('menolak rute yang tidak ada dengan 404', async () => {
    await request(app.getHttpServer()).get('/tidak-ada').expect(404);
  });
});
