import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';

describe('hash kata sandi (argon2id)', () => {
  it('menghasilkan format PHC dengan parameter rekomendasi OWASP', async () => {
    const hash = await hashPassword('rahasia-panjang');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  });

  it('memakai garam acak: kata sandi sama, hash berbeda', async () => {
    expect(await hashPassword('sama')).not.toBe(await hashPassword('sama'));
  });

  it('memverifikasi kata sandi yang benar dan menolak yang salah', async () => {
    const hash = await hashPassword('rahasia-panjang');

    expect(await verifyPassword('rahasia-panjang', hash)).toBe(true);
    expect(await verifyPassword('rahasia-panjanG', hash)).toBe(false);
  });

  it('menolak hash yang rusak atau dimanipulasi tanpa melempar galat', async () => {
    const hash = await hashPassword('rahasia');
    // Ubah satu karakter di tengah hash (bukan karakter terakhir: itu memuat bit padding).
    const i = hash.length - 10;
    const tampered = hash.slice(0, i) + (hash[i] === 'A' ? 'B' : 'A') + hash.slice(i + 1);

    expect(await verifyPassword('rahasia', tampered)).toBe(false);
    expect(await verifyPassword('rahasia', '$argon2id$v=19$m=1,t=1,p=1$xx$yy')).toBe(false);
    expect(await verifyPassword('rahasia', 'bukan-hash')).toBe(false);
    expect(await verifyPassword('rahasia', '')).toBe(false);
  });
});
