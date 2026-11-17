import { EntitySchema } from 'typeorm';

/** Bentuk baris setiap daftar master (customer, kategori, system, jarkom). */
export interface MasterRow {
  id: string;
  /** Huruf besar dan angka, unik per daftar, tetap setelah dibuat (dipakai di nomor tiket). */
  code: string;
  /** Unik per daftar tanpa membedakan huruf besar/kecil. */
  name: string;
  /** Nonaktif: tidak ditawarkan untuk data baru; baris yang sudah dipakai tidak bisa dihapus. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entity untuk satu tabel master. Nama constraint ditulis eksplisit agar sama persis dengan
 * migrasi. Keunikan nama memakai indeks ekspresi `lower(name)` yang dibuat migrasi; TypeORM
 * tidak bisa menyatakan ekspresi itu, jadi indeksnya dicatat dengan `synchronize: false`.
 */
export function masterEntity(entityName: string, tableName: string): EntitySchema<MasterRow> {
  return new EntitySchema<MasterRow>({
    name: entityName,
    tableName,
    columns: {
      id: {
        type: 'uuid',
        primary: true,
        default: () => 'uuidv7()',
        primaryKeyConstraintName: `${tableName}_pkey`,
      },
      code: { type: 'varchar', length: 16 },
      name: { type: 'varchar', length: 120 },
      active: { type: 'boolean', default: true },
      createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
      updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
    },
    uniques: [{ name: `${tableName}_code_key`, columns: ['code'] }],
    indices: [{ name: `${tableName}_name_key`, columns: ['name'], unique: true, synchronize: false }],
    checks: [{ name: `${tableName}_code_format`, expression: `code ~ '^[A-Z0-9]{2,16}$'` }],
  });
}
