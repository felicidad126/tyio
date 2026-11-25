# Prompt uji aplikasi NPR untuk agent browser

Salin teks di dalam kotak di bawah ke agent browser. Ganti dulu tiga isian dalam kurung siku.

Sebelum dijalankan:

- Aplikasi harus sudah berjalan dan bisa dibuka dari browser yang dipakai agent (di server Anda, atau `npm run dev` di laptop).
- Pakai database percobaan. Uji ini membuat NPR, TT, Gamas, dan akun baru.
- Siapkan satu berkas gambar PNG atau JPG kecil (di bawah 500 KB) untuk uji lampiran.

```text
Kamu menguji aplikasi web NETWORK PROBLEM REPORT (NPR) milik helpdesk
PT. Tangara Mitrakom. Aplikasi ini mencatat gangguan jaringan ATM: NPR
(laporan gangguan), TT (Trouble Ticket untuk teknisi), Gamas (gangguan
massal), dan Laporan SLA.

Alamat aplikasi: [ALAMAT, mis. http://192.168.1.10:5173]
Akun admin: username [USERNAME ADMIN], password [PASSWORD ADMIN]

Aturan:
- Ini database percobaan. Kamu boleh membuat data baru, tapi jangan
  menonaktifkan atau mengubah akun admin di atas.
- Semua waktu di aplikasi memakai WIB.
- Ikuti langkah berurutan. Jika satu langkah gagal, catat lalu lanjutkan
  ke langkah berikutnya sebisanya.
- Ambil tangkapan layar setiap kali ada yang tidak sesuai harapan.
- Jangan laporkan hal-hal di bagian "Belum dikerjakan" sebagai kesalahan.

LANGKAH UJI

1. Login
   a. Login dengan password salah. Harapan: muncul pesan "Username atau
      password salah."
   b. Login dengan akun admin. Harapan: halaman Dashboard terbuka, nama
      admin dan tulisan "Admin" tampil di kanan atas.

2. Menu
   Harapan: menu samping berisi Dashboard, NPR, Trouble Ticket, TT Gamas,
   Laporan SLA, Customer, Remote, Pengguna. Tidak ada lagi menu
   "New NPR", "Detail NPR", atau "Report NPR".

3. NPR baru
   a. Buka menu NPR, klik "+ NPR Baru".
   b. Pilih Jarkom, Customer, dan Remote yang tersedia, isi catatan, lalu
      klik "Submit NPR".
   Harapan: kembali ke Daftar NPR dengan pesan "NPR berhasil dibuat.".
   NPR baru ada di baris paling atas dengan nomor berbentuk
   NPR/TAHUN/BULAN/0001 (empat angka urut, bulan sekarang WIB), bukan
   angka acak panjang.
   c. Buat satu NPR baru lagi. Harapan: nomornya tepat satu lebih besar
      dari NPR sebelumnya.

4. Detail NPR dan status
   a. Buka Detail pada NPR pertama dari langkah 3. Harapan: "Pending By"
      bertuliskan "Belum dikategorikan" dan status OPEN.
   b. Pada form "Add Action NPR", pilih Tindakan "Problem", biarkan
      "Category Pending" pada "Pilih kategori", isi catatan, simpan.
      Harapan: form menolak karena kategori wajib dipilih.
   c. Pilih "Pending Customer", isi catatan, lampirkan berkas gambar
      kecil, simpan. Harapan: pesan "Tindakan berhasil disimpan.", status
      PENDING, dan riwayat menampilkan nama berkas lampiran.
   d. Klik nama berkas lampiran di riwayat. Harapan: berkas terunduh.
   e. Pilih Tindakan "Eskalasi Service", Instruction "Maintenance", isi
      catatan, kirim. Harapan: status ESKALASI, muncul bagian Trouble
      Ticket dengan nomor TT/TAHUN/BULAN/0001 (empat angka urut), dan
      PDF TIDAK terunduh otomatis.
   f. Tambah tindakan "Problem" dengan "Pending TM". Harapan: status
      TETAP ESKALASI (tidak berubah jadi PENDING).
   g. Klik "Unduh PDF TT". Harapan: berkas PDF terunduh.
   h. Pilih "Close". Harapan: tombol simpan tidak bisa diklik karena
      report teknisi belum ada.
   i. Tambah "Report Teknisi" dengan nama teknisi dan isi report.
      Harapan: status masih ESKALASI.
   j. Pilih "Close", isi waktu kembali online, simpan. Harapan: status
      CLOSED dan form tindakan hilang.

5. Daftar NPR
   a. Ketik nomor NPR kedua dari langkah 3 di kotak cari. Harapan: hanya
      NPR itu yang tampil.
   b. Kosongkan pencarian. Coba filter status, filter customer, dan
      filter tanggal. Harapan: isi tabel berubah sesuai filter.
   c. Ganti jumlah baris (10/25/50) dan pindah halaman dengan tombol
      panah. Harapan: tulisan "… NPR ditemukan" dan nomor halaman sesuai.
   d. Klik "Ekspor CSV". Harapan: berkas Laporan-NPR.csv terunduh, berisi
      semua NPR yang cocok dengan filter (bukan hanya satu halaman).

6. Dashboard
   a. Buka Dashboard. Harapan: ada 4 kartu (NPR Aktif, Critical >48 jam,
      Aging 24–48 jam, Menunggu Report), tabel "NPR aktif terlama",
      "Distribusi penanganan", grafik "NPR masuk · 7 hari terakhir", dan
      "Gangguan massal aktif".
   b. Klik kartu "NPR Aktif". Harapan: halaman NPR terbuka dengan penanda
      "Filter dari Dashboard: NPR aktif" dan jumlah NPR sama dengan angka
      di kartu. Klik × pada penanda. Harapan: filter hilang.
   c. Kembali ke Dashboard, klik "Belum dikategorikan" di Distribusi
      penanganan. Harapan: daftar NPR tersaring sesuai angkanya.
   d. Klik "Detail" pada salah satu baris "NPR aktif terlama". Harapan:
      detail NPR itu terbuka.

7. Gamas
   a. Buka TT Gamas, klik "+ TT Gamas". Isi lokasi, catatan, centang dua
      remote, kirim. Harapan: detail Gamas langsung terbuka, nomor
      GAMAS/TAHUN/BULAN/0001 (empat angka urut), dan PDF TIDAK terunduh
      otomatis.
   b. Tambah perkembangan dengan isian "Waktu perkembangan". Harapan:
      tersimpan dan tampil di riwayat.
   c. Centang "Tutup TT Gamas". Harapan: muncul isian "Waktu kembali
      online" yang wajib diisi.
   d. Isi report teknisi dan waktu kembali online, lalu simpan. Harapan:
      status CLOSED.
   e. Klik "Unduh PDF TT Gamas". Harapan: PDF terunduh.

8. Laporan SLA
   Harapan: periode yang terpilih adalah bulan sekarang (WIB), dan tabel
   SLA per site tampil. "Ekspor CSV" mengunduh berkas.

9. Akun pengguna
   a. Buka menu Pengguna, klik "+ Tambah akun". Coba password kurang dari
      12 karakter. Harapan: ditolak.
   b. Buat akun helpdesk baru (username huruf kecil, password minimal 12
      karakter). Harapan: akun tampil di tabel dengan status Aktif.
   c. Tekan Esc saat form terbuka. Harapan: form tertutup.
   d. Logout, login sebagai akun helpdesk baru. Harapan: kanan atas
      bertuliskan "Helpdesk" dan menu Pengguna TIDAK ada.
   e. Sebagai helpdesk, buat satu NPR. Di detailnya, riwayat "Create NPR"
      harus mencantumkan nama akun helpdesk itu.
   f. Klik "Ganti password". Coba dengan password lama yang salah.
      Harapan: ditolak. Lalu ganti dengan benar. Harapan: berhasil.
   g. Logout, login lagi sebagai admin. Di menu Pengguna, klik
      "Nonaktifkan" pada akun helpdesk itu. Coba login sebagai helpdesk.
      Harapan: ditolak dengan pesan akun dinonaktifkan.
   h. Pastikan pada baris akun admin sendiri tidak ada tombol
      "Nonaktifkan".

10. Keterbacaan
    Harapan: tidak ada tulisan yang terlalu kecil untuk dibaca (judul
    kolom tabel, label status, keterangan kecil), dan teks abu-abu tetap
    jelas terbaca.

11. Lebar HP
    Ubah lebar jendela menjadi sekitar 390 piksel dan buka Dashboard,
    NPR, dan detail NPR. Harapan: semua bisa dibuka dan dipakai, tidak
    ada tombol yang tertutup atau tidak bisa diklik. Tabel yang harus
    digeser ke samping BUKAN kesalahan (lihat bawah).

BELUM DIKERJAKAN (jangan dilaporkan sebagai kesalahan)
- Label campur bahasa Inggris dan Indonesia, misalnya "Add Action NPR",
  "Submit NPR", "Logout".
- Tulisan "dummy", "data fiktif", "simulasi", dan "Proyek Kerja Praktek".
- Logo masih berupa teks "TM", nama aplikasi masih "MONITORING".
- Halaman login bergaya iklan.
- Isi PDF masih teks polos tanpa kop dan tanda tangan.
- Tabel di layar HP harus digeser ke samping.
- Refresh halaman kembali ke Dashboard; tombol Back browser keluar dari
  aplikasi.

LAPORAN
Buat tabel dengan kolom: Langkah | Hasil (Lulus/Gagal) | Yang terlihat.
Untuk setiap yang Gagal, tulis apa yang diharapkan, apa yang terjadi,
pesan error di layar (salin persis), dan lampirkan tangkapan layarnya.
Di akhir, sebutkan nomor-nomor NPR, TT, dan Gamas yang kamu buat.
```
