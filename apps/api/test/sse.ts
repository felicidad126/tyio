import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { TEST_PASSWORD } from './fixtures.js';

// Pembaca aliran server-sent events untuk uji (langkah 2.2). supertest menahan respons sampai
// selesai, jadi aliran dibaca lewat http.get ke aplikasi uji yang benar-benar mendengarkan port.

export interface SseEvent {
  type: string;
  data: unknown;
}

export interface SseStream {
  status: number;
  events: SseEvent[];
  /** Event berikutnya (sejak pemanggilan sebelumnya) yang cocok, atau galat setelah `timeoutMs`. */
  next(type: string, match?: (data: unknown) => boolean, timeoutMs?: number): Promise<SseEvent>;
  /** Selesai bila server menutup aliran. */
  ended: Promise<void>;
  close(): void;
}

/** Port server aplikasi uji (`app.getHttpServer()`); mulai mendengarkan bila belum. */
async function baseUrl(server: http.Server): Promise<string> {
  if (!server.listening) await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Cookie sesi baru untuk pengguna uji. */
export async function sessionCookie(server: http.Server, email: string): Promise<string> {
  const res = await request(server).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`Login uji gagal: ${res.status}`);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((value) => value.startsWith('npr_sesi='));
  if (!cookie) throw new Error('Cookie sesi tidak ada.');
  return cookie.split(';')[0] ?? '';
}

export async function openStream(server: http.Server, cookie?: string): Promise<SseStream> {
  const url = `${await baseUrl(server)}/api/stream`;
  const events: SseEvent[] = [];
  const waiters: Array<() => void> = [];
  let cursor = 0;
  let endedResolve: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => (endedResolve = resolve));

  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.get(url, { headers: { accept: 'text/event-stream', ...(cookie ? { cookie } : {}) } }, resolve);
    req.on('error', reject);
  });
  let buffer = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      let type = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      if (data.length === 0) continue;
      const text = data.join('\n');
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // data bukan JSON: disimpan apa adanya
      }
      events.push({ type, data: parsed });
      for (const wake of waiters.splice(0)) wake();
    }
  });
  res.on('end', () => {
    endedResolve();
    for (const wake of waiters.splice(0)) wake();
  });
  res.on('close', () => endedResolve());

  return {
    status: res.statusCode ?? 0,
    events,
    ended,
    close: () => res.destroy(),
    async next(type, match = () => true, timeoutMs = 5_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        while (cursor < events.length) {
          const event = events[cursor];
          cursor += 1;
          if (event && event.type === type && match(event.data)) return event;
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`Event "${type}" tidak datang dalam ${timeoutMs} ms.`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  };
}
