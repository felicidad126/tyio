import type { INestApplication } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';
import { testConfig } from './test-config.js';

// Satu image melayani API di /api dan hasil build web di jalur lain (satu origin,
// sehingga cookie sesi T5 tidak butuh CORS).
describe('layanan aplikasi web', () => {
  let app: INestApplication;
  let webDir: string;

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), 'npr-web-'));
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>penanda-index</title>');
    mkdirSync(join(webDir, 'assets'));
    writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log("penanda-aset");');

    app = await createTestApp(testConfig({ webDistDir: webDir }));
  });

  afterAll(async () => {
    await app.close();
    rmSync(webDir, { recursive: true, force: true });
  });

  it('melayani index.html di akar, tanpa cache', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);

    expect(res.text).toContain('penanda-index');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('melayani index.html untuk rute aplikasi (tautan langsung / muat ulang)', async () => {
    const res = await request(app.getHttpServer()).get('/tiket/NPR-1').expect(200);

    expect(res.text).toContain('penanda-index');
  });

  it('melayani berkas aset apa adanya', async () => {
    const res = await request(app.getHttpServer()).get('/assets/app.js').expect(200);

    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('penanda-aset');
  });

  it('menjawab 404 untuk aset yang tidak ada, bukan index.html', async () => {
    const res = await request(app.getHttpServer()).get('/assets/tidak-ada.js').expect(404);

    expect(res.text).not.toContain('penanda-index');
  });

  it('tidak menelan jalur /api', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    const res = await request(app.getHttpServer()).get('/api/tidak-ada').expect(404);

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
