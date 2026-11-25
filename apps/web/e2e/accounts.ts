import { expect, type Page } from '@playwright/test';

// Akun dummy dari seed (apps/api/src/seed/seeders.ts). Di dev kata sandinya bawaan seed;
// di staging/CI isi E2E_USER_PASSWORD dengan SEED_USER_PASSWORD yang dipakai saat seed.
export const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'sandi-dev-npr';

export interface Account {
  email: string;
  name: string;
  /** Label peran seperti tampil di menu akun. */
  role: string;
}

export const ACCOUNTS = {
  l1: { email: 'dewi@noc.example', name: 'Dewi A.', role: 'L1 Monitoring' },
  l2: { email: 'arif@noc.example', name: 'Arif S.', role: 'L2 NOC' },
  admin: { email: 'admin@noc.example', name: 'Admin NOC', role: 'Admin' },
} as const satisfies Record<string, Account>;

export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

/** Tombol menu akun di bilah atas; nama aksesibelnya memuat nama dan peran. */
export function accountButton(page: Page, account: Account) {
  return page.getByRole('button', { name: new RegExp(`${escape(account.name)}.*${escape(account.role)}`) });
}

/** Masuk dari halaman login dan tunggu kerangka aplikasi tampil. */
export async function loginAs(page: Page, account: Account, path = '/masuk'): Promise<void> {
  await page.goto(path);
  await submitLogin(page, account.email, PASSWORD);
  await expect(accountButton(page, account)).toBeVisible();
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
