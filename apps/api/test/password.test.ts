import { describe, expect, it } from 'vitest';
import { hashPassword, PASSWORD_HASH_PARAMS, verifyPassword } from '../src/modules/users/password.js';

describe('hash kata sandi argon2id', () => {
  it('menyimpan dalam format PHC dengan parameter yang dipakai', async () => {
    const hash = await hashPassword('sandi-yang-cukup-panjang');
    const { memory, passes, parallelism } = PASSWORD_HASH_PARAMS;

    expect(hash).toMatch(
      new RegExp(`^\\$argon2id\\$v=19\\$m=${memory},t=${passes},p=${parallelism}\\$[A-Za-z0-9+/]+\\$[A-Za-z0-9+/]+$`),
    );
    expect(hash).not.toContain('sandi-yang-cukup-panjang');
  });

  it('cocok hanya untuk kata sandi yang sama', async () => {
    const hash = await hashPassword('sandi-yang-cukup-panjang');

    expect(await verifyPassword('sandi-yang-cukup-panjang', hash)).toBe(true);
    expect(await verifyPassword('sandi-yang-cukup-panjanG', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('memakai garam acak: kata sandi sama menghasilkan hash berbeda', async () => {
    expect(await hashPassword('sama-persis-12')).not.toBe(await hashPassword('sama-persis-12'));
  });

  it('menganggap huruf beraksen yang diketik berbeda sebagai kata sandi yang sama (NFC)', async () => {
    const composed = 'kafé-di-pantai'; // é sebagai satu karakter
    const decomposed = 'kafé-di-pantai'; // e + aksen gabung

    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it('menolak hash tersimpan yang rusak atau dengan parameter di luar batas, tanpa galat', async () => {
    const good = await hashPassword('sandi-yang-cukup-panjang');
    const tooHeavy = good.replace(/m=\d+/, 'm=999999999');

    expect(await verifyPassword('apa saja', 'bukan-hash')).toBe(false);
    expect(await verifyPassword('apa saja', '$argon2i$v=19$m=19456,t=2,p=1$YWJj$ZGVm')).toBe(false);
    expect(await verifyPassword('sandi-yang-cukup-panjang', tooHeavy)).toBe(false);
  });
});
