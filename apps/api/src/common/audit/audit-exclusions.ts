/**
 * Tabel entity yang sengaja TIDAK diberi trigger audit, beserta alasannya.
 * Semua tabel entity lain wajib punya trigger `<tabel>_audit` dan `<tabel>_audit_truncate`
 * (dijaga uji audit). Tabel baru otomatis wajib diaudit sampai dicantumkan di sini.
 */
export const AUDIT_EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  audit_log: 'Log audit itu sendiri; hanya-tambah dan dijaga trigger tersendiri.',
  sessions:
    'Diperbarui pada hampir setiap permintaan; login dan logout dicatat sebagai peristiwa auth.',
  login_failures:
    'Catatan teknis pembatasan percobaan; login yang ditolak dicatat sebagai peristiwa auth.',
};
