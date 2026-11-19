import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Hash kata sandi argon2id memakai implementasi bawaan Node (T5), tanpa dependensi native.
// Parameter mengikuti rekomendasi OWASP untuk argon2id: memori 19 MiB, 2 putaran, 1 jalur.
// Hash disimpan dalam format PHC ($argon2id$v=19$m=…,t=…,p=…$salt$hash) sehingga parameter
// bisa dinaikkan kelak tanpa membuat hash lama tidak terbaca.

const argon2Async = promisify(argon2);

export const PASSWORD_HASH_PARAMS = {
  memory: 19_456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
  saltLength: 16,
} as const;

// Batas wajar saat membaca hash tersimpan, agar data rusak tidak memicu komputasi raksasa.
const MAX_MEMORY = 1_048_576; // 1 GiB
const MAX_PASSES = 32;
const MAX_PARALLELISM = 16;

interface ParsedHash {
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  hash: Buffer;
}

export async function hashPassword(password: string): Promise<string> {
  const { memory, passes, parallelism, tagLength, saltLength } = PASSWORD_HASH_PARAMS;
  const salt = randomBytes(saltLength);
  const hash = await derive(password, { memory, passes, parallelism, salt, tagLength });
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${toB64(salt)}$${toB64(hash)}`;
}

/** `false` untuk kata sandi salah maupun hash tersimpan yang tidak bisa dibaca. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const candidate = await derive(password, { ...parsed, tagLength: parsed.hash.length });
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Menghabiskan waktu yang sama dengan verifikasi sungguhan, untuk email yang tidak terdaftar.
 * Dengan begitu lama jawaban login tidak membocorkan apakah sebuah email terdaftar.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('kata-sandi-pengganti-yang-tidak-pernah-cocok');
  await verifyPassword(password, await dummyHash);
}

function derive(
  password: string,
  params: { memory: number; passes: number; parallelism: number; salt: Buffer; tagLength: number },
): Promise<Buffer> {
  return argon2Async('argon2id', {
    // NFC agar huruf beraksen yang diketik di perangkat berbeda menghasilkan hash yang sama.
    message: Buffer.from(password.normalize('NFC'), 'utf8'),
    nonce: params.salt,
    memory: params.memory,
    passes: params.passes,
    parallelism: params.parallelism,
    tagLength: params.tagLength,
  });
}

function parseHash(stored: string): ParsedHash | undefined {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    stored,
  );
  if (!match) return undefined;
  const [, m, t, p, salt, hash] = match;
  const memory = Number(m);
  const passes = Number(t);
  const parallelism = Number(p);
  if (
    memory < 8 * parallelism ||
    memory > MAX_MEMORY ||
    passes < 1 ||
    passes > MAX_PASSES ||
    parallelism < 1 ||
    parallelism > MAX_PARALLELISM
  ) {
    return undefined;
  }
  const saltBytes = Buffer.from(salt ?? '', 'base64');
  const hashBytes = Buffer.from(hash ?? '', 'base64');
  if (saltBytes.length < 8 || hashBytes.length < 16) return undefined;
  return { memory, passes, parallelism, salt: saltBytes, hash: hashBytes };
}

/** Base64 tanpa padding, sesuai format PHC. */
function toB64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}
