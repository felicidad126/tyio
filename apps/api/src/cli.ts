/**
 * Menjalankan skrip baris perintah (migrasi, seed): galat dicetak sebagai satu pesan
 * yang bisa dibaca operator, lalu proses keluar dengan kode 1.
 */
export async function runScript(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
