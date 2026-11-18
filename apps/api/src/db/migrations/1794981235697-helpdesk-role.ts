import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Satu peran operasional: Helpdesk (K30). Pengguna L1 dan L2 menjadi helpdesk; admin tetap
 * sebagai pengelola aplikasi (K46). Perubahan data tercatat di audit atas nama sistem:migrasi.
 *
 * Catatan pembatalan: `down` mengembalikan semua helpdesk menjadi L1; pembedaan L1/L2 lama
 * tidak bisa dipulihkan.
 */
export class HelpdeskRole1794981235697 implements MigrationInterface {
  name = 'HelpdeskRole1794981235697';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    await queryRunner.query('ALTER TABLE users DROP CONSTRAINT users_role_valid');
    await queryRunner.query(`UPDATE users SET role = 'helpdesk' WHERE role IN ('L1', 'L2')`);
    await queryRunner.query(`ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('helpdesk', 'admin'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('tyio.actor', 'sistem:migrasi', true)`);
    await queryRunner.query('ALTER TABLE users DROP CONSTRAINT users_role_valid');
    await queryRunner.query(`UPDATE users SET role = 'L1' WHERE role = 'helpdesk'`);
    await queryRunner.query(`ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('L1', 'L2', 'admin'))`);
  }
}
