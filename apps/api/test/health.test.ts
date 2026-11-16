import type { INestApplication } from '@nestjs/common';
import type { HealthResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';

// Uji lewat HTTP terhadap AppModule utuh dan PostgreSQL asli (T11).
// HealthService di-inject lewat konstruktor, jadi uji ini juga menjaga metadata dekorator.
describe('GET /api/health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('menjawab 200 bila database terhubung', async () => {
    app = await createTestApp();

    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' } satisfies HealthResponse);
  });

  it('menjawab 503 bila koneksi database putus', async () => {
    app = await createTestApp();
    await app.get(DataSource).destroy();

    const res = await request(app.getHttpServer()).get('/api/health').expect(503);

    expect(res.body).toEqual({ status: 'error', database: 'error' } satisfies HealthResponse);
  });

  it('tidak lagi melayani /health tanpa prefix', async () => {
    app = await createTestApp();

    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
