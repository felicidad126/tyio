// Batas isian yang dipakai bersama oleh tampilan (src/) dan server (worker/).
// Ubah angka di sini saja, supaya pesan di layar dan penolakan server selalu sama.

export const BATAS = {
  // Customer
  kodeCustomer: 12,
  namaCustomer: 100,
  // Remote
  siteId: 60,
  lokasiAtm: 150,
  alamat: 500,
  kota: 100,
  provinsi: 100,
  ipLan: 15,
  namaPic: 150,
  teleponPic: 50,
  // NPR, TT, dan TT Gamas
  catatan: 4000,
  namaTeknisi: 120,
  namaLampiran: 150,
  lampiranByte: 500 * 1024,
  lokasiGamas: 200,
  siteGamas: 200,
  // Akun
  usernameMin: 3,
  usernameMaks: 32,
  namaLengkap: 100,
  passwordMin: 12,
  passwordMaks: 256,
} as const;

/** Kode customer: huruf dan angka saja (disimpan huruf besar). */
export const POLA_KODE_CUSTOMER = "[A-Za-z0-9]+";

/** Jenis berkas lampiran tindakan NPR. */
export const JENIS_LAMPIRAN = ["image/png", "image/jpeg", "application/pdf"];

/**
 * Panjang data URL untuk berkas sebesar lampiranByte (base64 ditambah awalan
 * "data:application/pdf;base64,"). Dipakai server sebagai batas kasar.
 */
export const PANJANG_DATA_LAMPIRAN = Math.ceil(BATAS.lampiranByte / 3) * 4 + 40;
