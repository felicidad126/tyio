import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// argon2id dari modul crypto bawaan Node (tanpa dependensi native).
// Parameter: rekomendasi OWASP (memori 19 MiB, 2 putaran, paralelisme 1).
const argon2Async = promisify(argon2);
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Hash dalam format PHC: `$argon2id$v=19$m=…,t=…,p=…$<garam>$<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const nonce = randomBytes(SALT_BYTES);
  const hash = await argon2Async('argon2id', { message: password, nonce, ...PARAMS });
  const { memory: m, passes: t, parallelism: p } = PARAMS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(nonce)}$${b64(hash)}`;
}

/** true hanya bila kata sandi cocok. Hash yang rusak atau asing menghasilkan false. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = PHC.exec(encoded);
  if (!match) return false;
  const [, m, t, p, salt, expectedB64] = match;
  const expected = Buffer.from(expectedB64 ?? '', 'base64');
  try {
    const actual = await argon2Async('argon2id', {
      message: password,
      nonce: Buffer.from(salt ?? '', 'base64'),
      memory: Number(m),
      passes: Number(t),
      parallelism: Number(p),
      tagLength: expected.length,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function b64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}
