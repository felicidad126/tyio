-- Penghitung nomor dokumen per jenis (NPR, TT, GAMAS) dan per bulan WIB.
-- Nomor yang sudah ada sebelumnya tidak diubah.
CREATE TABLE IF NOT EXISTS penghitung_nomor (
  jenis TEXT NOT NULL,
  periode TEXT NOT NULL,
  terakhir INTEGER NOT NULL,
  PRIMARY KEY (jenis, periode)
);
