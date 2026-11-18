import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Overview (langkah 2.1): tren harian "NPR Selesai per hari" dan saringan tanggal online kembali
 * di daftar membaca `closed_at` per rentang waktu; indeks parsial hanya untuk tiket yang ditutup.
 */
export class Overview1794987675303 implements MigrationInterface {
  name = 'Overview1794987675303';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX tickets_closed_at_idx ON tickets (closed_at) WHERE closed_at IS NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX tickets_closed_at_idx');
  }
}
