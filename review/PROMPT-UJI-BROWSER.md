# Prompt uji aplikasi NPR untuk agent browser

Prompt untuk agent browser yang menguji NPR dari sisi pemakai: login, NPR dari dibuat sampai
Close, TT, TT Gamas, Laporan SLA, akun pengguna, dan tampilan HP. Isinya sesuai aplikasi di commit
`e60a767` (27 November 2026), termasuk kategori pending yang hanya Pending TM dan Pending Customer.
Setiap langkah dan harapan di bawah sudah dicoba di server lokal berisi data demo.

Uji otomatis `review/uji/uji-browser.cjs` sudah dijalankan CI di setiap push. Prompt ini melengkapinya
dengan alur yang membuat data baru (NPR, TT, Gamas, akun), yang tidak dilakukan uji otomatis.

## Sebelum dijalankan

- **Tempat uji.** Pilih salah satu:
  - database percobaan di laptop atau server lokal; atau
  - https://kp.helonoia.com, **hanya selama data demo masih ada**. NPR dan Gamas yang dibuat agent
    memakai remote demo, jadi ikut terhapus saat data demo dihapus (`PROMPT-DATA-DEMO.md` bagian
    B). Akun `uji-helpdesk` tidak bisa dihapus, hanya dinonaktifkan; langkah 10 menonaktifkannya.
- **Isian dalam kurung siku** di prompt (alamat dan akun admin) diganti sendiri saat menempel ke
  agent. Jangan simpan password di repo atau berkas apa pun.
- **Berkas lampiran:** siapkan satu gambar PNG atau JPG kecil (di bawah 500 KB).

## Prompt

```text
Kamu menguji aplikasi web NPR (Network Problem Report) milik helpdesk
PT. Tangara Mitrakom. Aplikasi ini mencatat gangguan jaringan ATM: NPR
(laporan gangguan per site), TT (Trouble Ticket untuk teknisi), TT Gamas
(gangguan massal), dan Laporan SLA.

Alamat aplikasi: [ALAMAT, mis. https://kp.helonoia.com]
Akun admin: username [USERNAME ADMIN], password [PASSWORD ADMIN]

ATURAN:
- Jangan menonaktifkan, mengubah, atau mereset password akun admin di atas.
- Akun uji yang kamu buat: username uji-helpdesk, nama "Helpdesk Uji",
  password buatanmu sendiri (minimal 12 karakter). Jangan memakai password
  asli siapa pun, dan jangan menuliskan password di laporan.
- Pakai customer dan remote yang sudah ada. Jangan menambah customer atau
  remote.
- Semua waktu memakai WIB. Isian waktu (Mulai Gangguan, Waktu Tindakan,
  Kembali Online) sudah terisi waktu sekarang; biarkan apa adanya.
- Ikuti langkah berurutan. Jika satu langkah gagal, catat lalu lanjutkan
  sebisanya.
- Ambil tangkapan layar setiap kali ada yang tidak sesuai harapan.
- Status NPR ditulis Open, Pending, Eskalasi, Closed. Status TT Gamas
  ditulis Open, Ditangani, Closed.
- Jangan laporkan hal di bagian "BUKAN KESALAHAN" sebagai kesalahan.

LANGKAH UJI

1. Login
   a. Login dengan password salah. Harapan: pesan "Username atau password
      salah." di atas tombol Masuk.
   b. Login dengan akun admin. Harapan: Dashboard terbuka, kanan atas
      menampilkan nama admin dan tulisan "Admin".

2. Menu samping
   Harapan: empat kelompok:
   - Operasional: Dashboard, NPR, Trouble Ticket, TT Gamas
   - Laporan: Laporan SLA
   - Data Master: Customer, Remote
   - Admin: Pengguna

3. NPR baru
   a. Buka menu NPR, klik "NPR Baru".
   b. Pilih Jarkom, Customer, dan "Remote / Site ID". Pilih Jenis Gangguan
      "Remote Down", isi Catatan Awal, lalu klik "Simpan NPR".
      Harapan:
      - pesan "NPR berhasil dibuat.";
      - detail NPR baru langsung terbuka (alamat /npr/<angka>);
      - nomor berbentuk NPR/TAHUN/BULAN/NNNN (empat angka urut, bulan
        sekarang WIB);
      - status Open;
      - kotak Pending berisi "Pending TM" dan "Menunggu tindakan TM";
      - riwayat "Create NPR" bertuliskan "Remote Down · Pending TM";
      - tidak ada tulisan "Belum Dikategorikan" di mana pun.
   c. Kembali ke menu NPR dan buat satu NPR lagi dengan cara yang sama.
      Harapan: nomornya tepat satu lebih besar dari NPR sebelumnya.

4. Tindakan pada NPR pertama dari langkah 3 (buka dari daftar NPR)
   a. Lihat panel "Tambah Tindakan". Harapan: pilihan Tindakan hanya
      Problem, Eskalasi Service, dan Close (Report Teknisi belum ada karena
      belum ada TT). Pilih Problem. Harapan: isian "Pending oleh" sudah
      terisi "Pending TM".
   b. Ubah "Pending oleh" menjadi "Pending Customer". Harapan: muncul
      pengingat kuning yang diawali "Pending Customer hanya untuk penyebab
      di luar jaringan yang sudah dicek teknisi".
   c. Isi Catatan Tindakan, lampirkan berkas gambar lewat "Pilih File", lalu
      klik "Simpan Tindakan".
      Harapan:
      - pesan "Tindakan berhasil disimpan.";
      - status Pending dan kotak Pending berisi "Pending Customer";
      - riwayat menampilkan Problem dengan "Pending Customer" dan nama
        berkas lampiran.
   d. Klik nama berkas lampiran di riwayat. Harapan: berkas terunduh.
   e. Pilih Tindakan "Eskalasi Service". Harapan: keterangan "Form Trouble
      Ticket untuk NPR/..." dan isian Instruksi (Maintenance). Isi
      "Catatan Problem dari NOC", lalu klik "Kirim TT".
      Harapan:
      - pesan "TT berhasil dibuat. PDF dapat diunduh di atas.";
      - status Eskalasi dan kotak Pending kembali "Pending TM";
      - muncul bagian Trouble Ticket bernomor TT/TAHUN/BULAN/NNNN;
      - tombol "Unduh PDF TT" muncul di atas;
      - PDF TIDAK terunduh otomatis.
   f. Harapan: pilihan Tindakan sekarang Problem, Report Teknisi, dan
      Close. Tambah tindakan Problem dengan "Pending TM". Harapan: status
      TETAP Eskalasi.
   g. Klik "Unduh PDF TT". Harapan: berkas TT-TAHUN-BULAN-NNNN.pdf terunduh,
      berisi kop perusahaan, data site, kotak hasil pekerjaan teknisi, dan
      tempat tanda tangan teknisi dan helpdesk.
   h. Pilih Close. Harapan: tombol "Simpan Tindakan" tidak bisa diklik dan
      tampil keterangan "NPR dengan TT hanya dapat ditutup setelah report
      teknisi dicatat."
   i. Pilih Report Teknisi, isi Nama Teknisi dan isi report, lalu simpan.
      Harapan: status masih Eskalasi; di bagian Trouble Ticket, Teknisi dan
      Report sudah terisi.
   j. Pilih Close, isi catatan, lalu simpan. Harapan: status Closed, muncul
      "Kembali Online" dan "Selesai dalam ...", dan panel Tambah Tindakan
      hilang.

5. Daftar NPR
   a. Ketik nomor NPR kedua dari langkah 3 di kotak "Cari NPR, TT, Site,
      atau Lokasi". Harapan: tertulis "1 NPR" dan hanya NPR itu yang tampil.
   b. Kosongkan pencarian. Klik "Filter", lalu coba Status, Customer, dan
      Tanggal Mulai Gangguan (Dari, Sampai). Harapan: jumlah dan isi tabel
      berubah sesuai filter. "Hapus Filter" mengembalikan semua NPR.
   c. Ganti jumlah baris (10, 25, 50, atau 100 Baris) dan pindah halaman
      dengan tombol panah. Harapan: penanda halaman (mis. "1 / 3") sesuai.
   d. Klik kepala kolom "Mulai" dua kali. Harapan: klik pertama mengurutkan
      dari gangguan terbaru (panah turun), klik kedua dari yang terlama
      (panah naik, NPR paling lama di atas).
   e. Klik "Ekspor CSV". Harapan: berkas Laporan-NPR.csv terunduh, berisi
      semua NPR yang cocok dengan filter (bukan hanya satu halaman).

6. Dashboard
   a. Buka Dashboard. Harapan:
      - empat kartu: NPR Aktif, Aktif Lebih dari 48 Jam, Aktif 24–48 Jam,
        TT Menunggu Report;
      - grafik "NPR Masuk per Hari" di atas tabel "NPR Aktif";
      - panel "Pihak yang Ditunggu" hanya berisi Pending TM dan Pending
        Customer;
      - panel "Gangguan Massal Aktif".
   b. Klik kartu "Aktif Lebih dari 48 Jam". Harapan: daftar NPR tersaring
      dengan penanda "Aktif Lebih dari 48 Jam", dan jumlahnya sama dengan
      angka di kartu. Klik × pada penanda. Harapan: filter hilang.
   c. Kembali ke Dashboard, klik "Pending Customer" di panel Pihak yang
      Ditunggu. Harapan: daftar tersaring, jumlahnya sama dengan angka di
      panel.
   d. Kembali ke Dashboard, klik salah satu baris tabel NPR Aktif. Harapan:
      detail NPR itu terbuka. Tekan tombol Back browser. Harapan: kembali ke
      Dashboard, bukan keluar dari aplikasi.

7. Trouble Ticket
   Buka menu Trouble Ticket. Harapan: TT dari langkah 4 ada di daftar.
   Klik tombol PDF pada barisnya. Harapan: PDF TT terunduh.

8. TT Gamas
   a. Buka TT Gamas, klik "TT Gamas Baru". Isi Lokasi Penanganan dan
      Catatan Problem, centang dua remote, lalu klik "Kirim TT Gamas".
      Harapan:
      - pesan "TT Gamas berhasil dibuat. PDF dapat diunduh dari halaman
        detail.";
      - detail langsung terbuka, bernomor GAMAS/TAHUN/BULAN/NNNN, status Open;
      - PDF TIDAK terunduh otomatis.
   b. Di panel "Perbarui Penanganan", isi Catatan Perkembangan lalu klik
      "Simpan Perkembangan". Harapan: pesan "Perkembangan Gamas berhasil
      disimpan.", status Ditangani, riwayat bertambah.
   c. Centang "Tutup TT Gamas". Harapan: muncul isian "Kembali Online" dan
      tombol berubah menjadi "Simpan dan Tutup".
   d. Biarkan Report Teknisi kosong, isi catatan, klik "Simpan dan Tutup".
      Harapan: ditolak dengan pesan "Report teknisi diperlukan sebelum Close
      Gamas."
   e. Isi Report Teknisi, klik "Simpan dan Tutup". Harapan: pesan "TT Gamas
      berhasil ditutup.", status Closed, panel Perbarui Penanganan hilang.
   f. Klik "Unduh PDF". Harapan: berkas GAMAS-TAHUN-BULAN-NNNN.pdf terunduh.

9. Laporan SLA
   a. Buka Laporan SLA. Harapan: periode bulan sekarang (mis. "November
      2026", "masih berjalan"), Target SLA 99,50%, dan tabel SLA per site.
      Tombol bulan berikutnya tidak bisa diklik.
   b. Klik bulan sebelumnya, lalu tekan F5. Harapan: tetap di bulan yang
      dipilih.
   c. Klik "Ekspor CSV". Harapan: berkas SLA-TAHUN-BULAN.csv terunduh.

10. Akun pengguna
    a. Buka menu Pengguna, klik "Tambah Akun". Isi username uji-helpdesk,
       Nama Lengkap "Helpdesk Uji", peran Helpdesk, dan password 11
       karakter, lalu klik "Simpan". Harapan: akun tidak tersimpan dan
       isian password ditandai (minimal 12 karakter).
    b. Tekan Esc. Harapan: form tertutup.
    c. Buka lagi "Tambah Akun", isi seperti di atas dengan password minimal
       12 karakter, lalu simpan. Harapan: pesan "Akun uji-helpdesk berhasil
       dibuat." dan akun tampil di tabel dengan status Aktif.
    d. Klik tombol aksi (titik tiga) di baris akun admin yang sedang
       dipakai. Harapan: hanya "Ubah Nama dan Peran" dan "Reset Password",
       tanpa "Nonaktifkan".
    e. Buka menu akun di kanan atas, klik "Keluar". Login sebagai
       uji-helpdesk. Harapan: kanan atas bertuliskan "Helpdesk", dan menu
       samping tanpa kelompok Admin (Pengguna). Buka alamat /pengguna.
       Harapan: tulisan "Menu ini hanya untuk admin."
    f. Sebagai helpdesk, buat satu NPR. Harapan: di detailnya, "Dibuat
       oleh" dan riwayat "Create NPR" mencantumkan "Helpdesk Uji".
    g. Buka menu akun, klik "Ganti Password". Isi password lama yang salah.
       Harapan: ditolak dengan pesan "Password lama salah." di dalam form.
       Lalu ganti dengan benar. Harapan: pesan "Password berhasil diganti."
    h. Keluar, login lagi sebagai admin. Di menu Pengguna, buka tombol aksi
       pada uji-helpdesk, klik "Nonaktifkan". Harapan: pesan "Akun
       uji-helpdesk dinonaktifkan." dan status Nonaktif. Keluar, coba login
       sebagai uji-helpdesk. Harapan: ditolak dengan pesan "Akun ini sudah
       dinonaktifkan. Hubungi admin."

11. Alamat per halaman
    a. Login sebagai admin, buka detail salah satu NPR, lalu tekan F5.
       Harapan: tetap di detail NPR yang sama.
    b. Salin alamat detail NPR itu, buka di tab baru. Harapan: detail yang
       sama terbuka.

12. Keterbacaan
    Harapan: tidak ada tulisan yang terlalu kecil untuk dibaca (judul kolom,
    label status, keterangan kecil), dan teks abu-abu tetap jelas terbaca.

13. Lebar HP
    Ubah lebar jendela menjadi sekitar 390 piksel (atau emulasi HP), lalu
    buka Dashboard, NPR, detail NPR, Trouble Ticket, dan TT Gamas. Harapan:
    - menu dibuka lewat tombol ☰ di kiri atas;
    - daftar NPR, TT, dan TT Gamas tampil sebagai kartu, tanpa perlu digeser
      ke samping;
    - form Tambah Tindakan di detail NPR bisa dipakai, dan pengingat Pending
      Customer terbaca utuh;
    - tidak ada tombol yang tertutup atau tidak bisa diklik.

BUKAN KESALAHAN (jangan dilaporkan)
- Halaman Login memuat "Proyek Kerja Praktek, Universitas Dian Nusantara"
  dan "Lupa password? Chat mimin yaa." Keduanya disengaja.
- Nama bank, lokasi, dan PIC di data demo memang fiktif.
- Tanda "—" untuk isian yang kosong.
- Saat PDF pertama diunduh, perlu jeda 1–2 detik karena pustaka PDF baru
  dimuat saat dibutuhkan.
- Tulisan "Memuat halaman…" sebentar saat sebuah menu dibuka pertama kali.
- Galat 401 di konsol browser saat halaman Login dibuka atau saat password
  salah (pemeriksaan sesi).

LAPORAN
Buat tabel dengan kolom: Langkah | Hasil (Lulus/Gagal) | Yang terlihat.
Untuk setiap yang Gagal, tulis apa yang diharapkan, apa yang terjadi, pesan
di layar (salin persis), dan lampirkan tangkapan layarnya.
Di akhir, sebutkan:
- nomor NPR, TT, dan TT Gamas yang kamu buat;
- status akhir akun uji-helpdesk (harus Nonaktif).
```
