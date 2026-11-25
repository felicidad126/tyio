import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ROLES,
  isRole,
  type Role,
} from '@npr/shared';
import { type EntityManager, In } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity.js';
import { hashPassword } from './password.js';
import { User } from './user.entity.js';

// Pembuatan akun yang dipakai bersama oleh layanan API, seed, dan perintah CLI
// `create-user`, sehingga aturan validasinya hanya ada di satu tempat.

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  password: string;
  /**
   * Kode customer yang boleh diakses (K26). Kosong atau tidak diisi = semua customer.
   */
  tenantCodes?: readonly string[];
}

/** Masukan pengguna yang tidak sah; pesannya aman ditampilkan ke operator. */
export class UserInputError extends Error {
  override name = 'UserInputError';
}

const NAME_MAX_LENGTH = 120;

/** Email dibandingkan tanpa peduli huruf besar/kecil dan spasi di ujung (K27). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Membuat pengguna baru. Dengan `replaceExisting`, pengguna dengan email yang sama
 * diperbarui (dipakai seed agar bisa dijalankan ulang); tanpa itu, email ganda ditolak.
 */
export async function saveUser(
  manager: EntityManager,
  input: NewUser,
  options: { replaceExisting?: boolean } = {},
): Promise<User> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const problems: string[] = [];
  if (!isPlausibleEmail(email)) problems.push('email tidak sah');
  if (name === '' || name.length > NAME_MAX_LENGTH) {
    problems.push(`nama wajib diisi, paling panjang ${NAME_MAX_LENGTH} karakter`);
  }
  if (!isRole(input.role)) problems.push(`peran harus salah satu dari: ${ROLES.join(', ')}`);
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  if (problems.length > 0) {
    throw new UserInputError(`Data pengguna tidak sah: ${problems.join('; ')}.`);
  }

  const codes = [...new Set((input.tenantCodes ?? []).map((code) => code.trim().toUpperCase()))]
    .filter((code) => code !== '');
  const tenants =
    codes.length === 0
      ? []
      : await manager.getRepository(Tenant).find({ where: { code: In(codes), active: true } });
  const unknown = codes.filter((code) => !tenants.some((tenant) => tenant.code === code));
  if (unknown.length > 0) {
    throw new UserInputError(`Kode customer tidak dikenal atau nonaktif: ${unknown.join(', ')}.`);
  }

  const repo = manager.getRepository(User);
  const existing = await repo.findOne({ where: { email } });
  if (existing && !options.replaceExisting) {
    throw new UserInputError('Email sudah dipakai pengguna lain.');
  }

  const user = existing ?? repo.create();
  user.email = email;
  user.name = name;
  user.role = input.role;
  user.passwordHash = await hashPassword(input.password);
  user.allTenants = codes.length === 0;
  user.tenants = tenants;
  user.active = true;
  return repo.save(user);
}
