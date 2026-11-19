// Membuat satu pengguna, termasuk admin pertama di staging dan produksi (K29):
//
//   node dist/modules/users/create-user.js --email admin@contoh.co.id --name "Nama" --role admin
//     [--tenants BNA,BAD]
//
// Kata sandi dibaca dari stdin, tidak pernah dari argumen (argumen tercatat di riwayat
// shell dan daftar proses). Di terminal, kata sandi diminta dua kali tanpa ditampilkan.
// Lewat pipa: printf '%s' "$SANDI" | docker compose ... run --rm -T app node dist/... .
import 'reflect-metadata';
import { isRole, PASSWORD_MIN_LENGTH, ROLE_LABELS, ROLES } from '@tyio/shared';
import { parseArgs } from 'node:util';
import { DataSource } from 'typeorm';
import { auditedTransaction } from '../../common/audit/audit-context.js';
import { runScript } from '../../cli.js';
import { loadConfig } from '../../config.js';
import { dataSourceOptions } from '../../db/options.js';
import { saveUser } from './user-accounts.js';

const USAGE =
  'Pemakaian: node dist/modules/users/create-user.js --email <email> --name "<nama>" ' +
  `--role <${ROLES.join('|')}> [--tenants KODE1,KODE2]\n` +
  'Tanpa --tenants pengguna boleh mengakses semua customer. Kata sandi dibaca dari stdin.';

await runScript(async () => {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string' },
        tenants: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }));
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`, {
      cause: error,
    });
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (!values.email || !values.name || !values.role) throw new Error(USAGE);
  if (!isRole(values.role)) throw new Error(`Peran harus salah satu dari: ${ROLES.join(', ')}.`);
  const role = values.role;

  const password = await readPassword();
  const tenantCodes = values.tenants?.split(',') ?? [];

  const dataSource = new DataSource(dataSourceOptions(loadConfig().databaseUrl));
  await dataSource.initialize();
  try {
    const user = await auditedTransaction(dataSource, { source: 'cli', label: 'create-user' }, (manager) =>
      saveUser(manager, { email: values.email ?? '', name: values.name ?? '', role, password, tenantCodes }),
    );
    const access = user.allTenants
      ? 'semua customer'
      : user.tenants.map((tenant) => tenant.code).join(', ');
    console.log(`Pengguna dibuat: ${user.email} · ${ROLE_LABELS[user.role]} · akses ${access}.`);
  } finally {
    await dataSource.destroy();
  }
});

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += String(chunk);
    return input.replace(/\r?\n$/, '');
  }
  const first = await promptHidden('Kata sandi baru: ');
  if (first.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`);
  }
  const second = await promptHidden('Ulangi kata sandi: ');
  if (first !== second) throw new Error('Kedua kata sandi tidak sama.');
  return first;
}

/** Membaca satu baris dari terminal tanpa menampilkan ketikan. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let value = '';
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Dibatalkan.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}
