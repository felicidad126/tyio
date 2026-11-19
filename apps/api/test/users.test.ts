import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/options.js';
import { verifyPassword } from '../src/modules/users/password.js';
import { auditedTransaction } from '../src/common/audit/audit-context.js';
import { type NewUser, saveUser, UserInputError } from '../src/modules/users/user-accounts.js';
import { User } from '../src/modules/users/user.entity.js';
import { asOperator, insertTenant, TEST_PASSWORD, uniqueEmail } from './fixtures.js';
import { testConfig } from './test-config.js';

describe('akun pengguna', () => {
  const dataSource = new DataSource(dataSourceOptions(testConfig().databaseUrl));

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  function newUser(overrides: Partial<NewUser> = {}): NewUser {
    return { email: uniqueEmail(), name: 'Pengguna Uji', role: 'l1', password: TEST_PASSWORD, ...overrides };
  }

  function save(input: NewUser, options?: { replaceExisting?: boolean }): Promise<User> {
    return auditedTransaction(dataSource, { source: 'cli', label: 'uji otomatis' }, (manager) =>
      saveUser(manager, input, options),
    );
  }

  it('menyimpan email huruf kecil, hash kata sandi, dan akses semua customer secara bawaan', async () => {
    const email = uniqueEmail('Campuran');
    const saved = await save(newUser({ email: `  ${email.toUpperCase()}  ` }));

    const row = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: saved.id })
      .getOneOrFail();
    expect(row.email).toBe(email.toLowerCase());
    expect(row.allTenants).toBe(true);
    expect(row.passwordHash).not.toContain(TEST_PASSWORD);
    expect(await verifyPassword(TEST_PASSWORD, row.passwordHash)).toBe(true);
  });

  it('tidak pernah memuat hash kata sandi kecuali diminta', async () => {
    const saved = await save(newUser());

    const loaded = await dataSource.getRepository(User).findOneByOrFail({ id: saved.id });
    expect(loaded.passwordHash).toBeUndefined();
  });

  it('membatasi akses ke customer tertentu bila kodenya diberikan', async () => {
    const nusa = await insertTenant(dataSource, 'Bank Nusa Uji');
    const andalas = await insertTenant(dataSource, 'Bank Andalas Uji');

    const saved = await save(newUser({ tenantCodes: [nusa.code.toLowerCase(), ` ${andalas.code}`] }));

    const loaded = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { id: saved.id }, relations: { tenants: true } });
    expect(loaded.allTenants).toBe(false);
    expect(loaded.tenants.map((tenant) => tenant.code).sort()).toEqual([andalas.code, nusa.code].sort());
  });

  it('menolak kode customer yang tidak ada atau nonaktif', async () => {
    const inactive = await insertTenant(dataSource, 'Bank Tutup', { active: false });

    await expect(save(newUser({ tenantCodes: ['ZZZ999'] }))).rejects.toThrow(/ZZZ999/);
    await expect(save(newUser({ tenantCodes: [inactive.code] }))).rejects.toThrow(inactive.code);
  });

  it('menolak email yang sudah dipakai, tanpa peduli huruf besar/kecil', async () => {
    const email = uniqueEmail();
    await save(newUser({ email }));

    await expect(save(newUser({ email: email.toUpperCase() }))).rejects.toThrow(/sudah dipakai/);
  });

  it('memperbarui pengguna yang ada bila diminta (dipakai seed)', async () => {
    const email = uniqueEmail();
    const first = await save(newUser({ email, name: 'Nama Lama' }));

    const second = await save(newUser({ email, name: 'Nama Baru', role: 'l2' }), {
      replaceExisting: true,
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Nama Baru');
    expect(second.role).toBe('l2');
  });

  it('menolak data yang tidak sah dengan pesan yang bisa dibaca operator', async () => {
    await expect(save(newUser({ email: 'bukan-email' }))).rejects.toThrow(UserInputError);
    await expect(save(newUser({ password: 'pendek' }))).rejects.toThrow(/minimal 12/);
    await expect(save(newUser({ name: '   ' }))).rejects.toThrow(/nama wajib/);
    await expect(save(newUser({ role: 'l3' as never }))).rejects.toThrow(/peran/);
  });

  it('database sendiri menolak email huruf besar dan peran yang tidak dikenal', async () => {
    const insert = (email: string, role: string) =>
      asOperator(dataSource, (manager) =>
        manager.query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)', [
          email,
          'Langsung',
          role,
          'x',
        ]),
      );

    await expect(insert(uniqueEmail().toUpperCase(), 'l1')).rejects.toThrow(/users_email_lowercase/);
    await expect(insert(uniqueEmail(), 'l3')).rejects.toThrow(/users_role_valid/);
  });
});
