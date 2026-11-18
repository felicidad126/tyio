import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeCall {
  method: string;
  body: Record<string, unknown>;
  /** Kode HTTP yang dijawab. */
  status: number;
}

interface Override {
  status: number;
  body: object;
  /** Jawaban ditahan sampai `release()` dipanggil. */
  hold?: Promise<void>;
}

/**
 * Telegram Bot API tiruan untuk uji notifikasi: menerima /bot<token>/<metode>, mencatat setiap
 * panggilan, dan menjawab seperti Telegram. Jawaban berikutnya untuk suatu metode bisa diatur
 * (galat, jeda) lewat `next()`.
 */
export class FakeTelegram {
  readonly calls: FakeCall[] = [];
  updates: object[] = [];
  me = { id: 7000001, is_bot: true, username: 'noc_uji_bot' };
  private readonly overrides = new Map<string, Override[]>();
  private server: Server | null = null;
  private messageId = 100;

  constructor(private readonly token: string) {}

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req).then(({ status, body }) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  reset(): void {
    this.calls.length = 0;
    this.overrides.clear();
    this.updates = [];
  }

  /** Jawaban untuk panggilan `method` berikutnya. */
  next(method: string, status: number, body: object): void {
    this.overrides.set(method, [...(this.overrides.get(method) ?? []), { status, body }]);
  }

  /** Panggilan `method` berikutnya ditahan (dijawab sukses) sampai fungsi yang dikembalikan dipanggil. */
  hold(method: string): () => void {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    this.overrides.set(method, [...(this.overrides.get(method) ?? []), { status: 200, body: {}, hold }]);
    return release;
  }

  /** Pesan yang diterima Telegram (sendMessage yang dijawab sukses). */
  sent(): Array<{ chat_id: string; text: string; message_thread_id?: number; parse_mode?: string }> {
    return this.calls
      .filter((c) => c.method === 'sendMessage' && c.status === 200)
      .map((c) => c.body as { chat_id: string; text: string; message_thread_id?: number; parse_mode?: string });
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; body: object }> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>) : {};
    const match = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '');
    const method = match?.[2] ?? '';
    const answer = async (status: number, payload: object) => {
      this.calls.push({ method, body, status });
      return { status, body: payload };
    };
    if (!match || match[1] !== this.token) {
      return answer(401, { ok: false, error_code: 401, description: 'Unauthorized' });
    }
    const override = this.overrides.get(method)?.shift();
    if (override?.hold) await override.hold;
    if (override && override.status !== 200) return answer(override.status, override.body);
    if (method === 'sendMessage') {
      return answer(200, { ok: true, result: { message_id: ++this.messageId, chat: { id: body.chat_id }, text: body.text } });
    }
    if (method === 'getMe') return answer(200, { ok: true, result: this.me });
    if (method === 'getUpdates') return answer(200, { ok: true, result: this.updates });
    return answer(404, { ok: false, error_code: 404, description: 'Not Found: method not found' });
  }
}
