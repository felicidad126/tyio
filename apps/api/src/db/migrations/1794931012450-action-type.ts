import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Jenis tindakan di linimasa (K32, langkah 1.5c): catatan, cek lokasi, atau problem. Entri lama
 * menjadi "catatan". Cek lokasi dan Problem wajib berisi catatan. Menambah kolom dengan nilai
 * bawaan tidak mengubah baris yang ada, jadi trigger hanya-tambah (T10) tidak terpicu.
 */
export class ActionType1794931012450 implements MigrationInterface {
  name = 'ActionType1794931012450';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        ADD COLUMN action_type varchar(16) NOT NULL DEFAULT 'catatan',
        ADD CONSTRAINT ticket_actions_type_valid CHECK (action_type IN ('catatan', 'cek_lokasi', 'problem')),
        ADD CONSTRAINT ticket_actions_type_note CHECK (action_type = 'catatan' OR note IS NOT NULL)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ticket_actions
        DROP CONSTRAINT ticket_actions_type_note,
        DROP CONSTRAINT ticket_actions_type_valid,
        DROP COLUMN action_type`);
  }
}
