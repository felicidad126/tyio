-- Kategori pending hanya Pending TM dan Pending Customer. NPR yang dulu dibuat
-- tanpa kategori ("Belum Dikategorikan") menjadi Pending TM, karena gangguan
-- dianggap tanggung jawab TM sampai ada bukti pengecekan teknisi bahwa
-- penyebabnya di luar jaringan. Riwayat tindakannya ikut disesuaikan.
--
-- Angka SLA tidak berubah untuk data yang dicatat lewat aplikasi: catatan
-- Create NPR tidak dipakai dalam hitungan SLA, dan setelah TT dibuat kategori
-- selalu terisi (Eskalasi Service menjadikannya Pending TM).

UPDATE nprs SET pending_by = 'TM' WHERE pending_by = '';
UPDATE actions SET pending_by = 'TM' WHERE pending_by = '';
