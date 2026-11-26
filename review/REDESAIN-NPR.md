# Redesain Tampilan NPR: Catatan Serah Terima

Status: **prototipe selesai untuk semua halaman**. Prototipe belum dipindahkan ke aplikasi.

- Prototipe: [`../redesain-npr/`](../redesain-npr/). Buka `redesain-npr/redesain-npr.html` di browser.
- Aplikasi yang akan diubah: [`../monitoring-vsat/`](../monitoring-vsat/).
- Branch kerja: `Rev-NPR-Tyio`. Jangan di-merge ke `main`.

## 1. Tujuan dan batasan

- Hanya **merapikan tampilan**. Fitur dan alur kerja aplikasi tidak berubah.
- Hindari tampilan "AI slop":
  - Status berbentuk pil bergradasi.
  - Kartu dengan kotak ikon.
  - Avatar dekoratif.
  - Ornamen lingkaran.
  - Kotak info dengan ikon ⓘ.
  - Tata letak serba di tengah.
  - Font Inter.
- Bahasa label Indonesia, istilah kerja tetap (keputusan D-8 a).
- Label akademik hanya muncul di halaman Login (D-1 b).
- Halaman harus bisa dipakai di HP (D-4 b).

## 2. Aturan visual yang dipakai

| Hal | Aturan |
|---|---|
| Huruf | Plus Jakarta Sans. JetBrains Mono hanya untuk IP LAN. |
| Warna merek | Navy `#032459` dan biru muda `#53e9fa` (dari logo). |
| Status | Kotak kecil `size-2` + teks berwarna, **tanpa pil**. Sama untuk NPR, TT, Gamas, akun, dan capaian SLA. |
| Ukuran huruf tabel | Isi 13 px. Keterangan baris kedua dan kepala kolom 12 px. Kartu HP 14 px. |
| Nomor dokumen | Huruf utama tebal dengan `tabular-nums`, bukan mono. |
| Huruf kapital | Label, tombol, isi dropdown, placeholder, kepala kolom, dan judul panel memakai huruf besar di awal kata. Kata tugas (dan, atau, dari, yang, per, oleh, dalam) tetap kecil. Kalimat penjelasan memakai huruf kapital biasa. |
| Sudut | `rounded-md` untuk panel, input, dan tombol. |
| Ringkasan | Kotak berlabel dengan garis 1 px (`gap-px bg-border`). Dipakai di Dashboard, Detail NPR, Detail Gamas, dan Laporan SLA. Tidak memakai kalimat bertitik seperti "A · B · C". |
| Lebar | Konten selebar layar. Tabel bergeser ke samping hanya jika memang tidak muat. |

## 3. Pola halaman daftar (tabel)

Semua halaman daftar memakai komponen yang sama dari `src/components/tabel.tsx`. Halaman yang memakainya: NPR, Trouble Ticket, Trouble Ticket Gamas, Laporan SLA, Customer, Remote, dan Pengguna.

1. **Toolbar**: kotak cari memanjang di kiri dan satu tombol **Filter** di kanan, yang menampilkan jumlah filter aktif. Isi Filter berupa dropdown. Di HP, pilihan **Urutkan** juga ada di dalam Filter.
2. **Baris ringkasan** tingginya tetap (`h-11`): jumlah hasil, chip filter aktif, dan "Hapus Semua". Baris ini selalu tampil supaya tabel tidak naik-turun saat filter berubah.
3. **Kepala kolom bisa diurutkan**: ikon ⇅, ↑ untuk naik, ↓ untuk turun. Kolom angka rata kanan.
4. **Lebar kolom tetap** (`table-fixed` + `colgroup`), supaya kolom tidak bergeser saat isi tabel berubah. Sisa ruang diberikan ke satu kolom teks. Di layar lebar ada kolom tambahan (lihat Remote dan Pengguna) supaya tidak ada blok kosong.
5. Klik baris membuka detail. Tombol PDF berupa ikon dan tidak ikut membuka detail.
6. Di HP, tabel diganti kartu.
7. Ruang scrollbar selalu disediakan (`scrollbar-gutter: stable`), dan margin tambahan dari Radix saat dropdown terbuka dimatikan. Tanpa ini tabel bergeser ±15 px di Windows.

## 4. Ringkasan per halaman

| Halaman | Perubahan utama |
|---|---|
| Kerangka | Sidebar navy berkelompok, menu laci di HP, breadcrumb bertingkat (NPR / Detail, Trouble Ticket Gamas / Detail) yang bisa diklik. |
| Dashboard | Ringkasan 4 angka yang bisa diklik, tabel NPR aktif, grafik harian bersumbu, panel "Pihak yang Ditunggu" dengan persentase, dan gangguan massal aktif. |
| NPR | Tabel dengan Filter (status, customer, tanggal mulai), sort, dan 25 baris per halaman. |
| NPR Baru | Satu kartu form dengan bagian Lokasi dan Gangguan, judul bagian di kiri. Tombol di bawah form. Pratinjau Data Site di samping (di HP langsung di bawah pilihan site). |
| Detail NPR | Ringkasan 6 kotak, garis waktu Riwayat Tindakan, form Tambah Tindakan (2 kolom, lampiran "Pilih File"), panel Data Site dan Trouble Ticket. |
| Trouble Ticket | Tabel dan Filter (instruksi, report, status NPR, tanggal). Instruksi berupa teks biasa, bukan pil. |
| Trouble Ticket Gamas | Tabel, detail dengan ringkasan, garis waktu, dan Site Terdampak. Judul halaman ditulis lengkap, tombol tetap "TT Gamas Baru". |
| Laporan SLA | Pemilih periode ‹ bulan ›, ringkasan 5 kotak, tabel SLA (bawaan: SLA terendah di atas), catatan cara hitung di bawah tabel. |
| Customer | Tabel dengan kolom berkelompok: Remote (Total/VSAT/M2M), NPR (Aktif/Bulan Ini), dan SLA. Klik baris membuka Remote yang tersaring. |
| Remote | Tabel dengan jarak antar-kolom seragam (±32 px). Kolom angka muncul dari 1660 px, Gangguan Terakhir dari 1880 px. Form tambah dibagi 3 bagian. |
| Pengguna | Tabel tanpa avatar dan tanpa pil. Status memakai kotak kecil. Kolom NPR Dicatat, TT Dibuat, Tindakan Bulan Ini, dan Tindakan Terakhir. Peran dipilih dengan tombol. |
| Login | Panel navy ramping berisi daftar modul, pesan gagal di atas tombol, petunjuk lupa password. |
| Ganti Password | Tombol tampilkan password dan syarat yang dicentang sambil mengetik. Tombol simpan aktif hanya jika semua syarat terpenuhi. |

Isian tanggal di semua form bisa **diketik** (dd/mm/yyyy, garis miring otomatis) **atau dipilih dari kalender**. Bulan dipilih dari dropdown, tahun diketik. Jam memakai format 24 jam WIB, misalnya `0905` menjadi `09:05`.

## 5. Yang perlu disiapkan saat dipindahkan ke aplikasi

Beberapa angka di prototipe dihitung dari data contoh di browser. Di aplikasi asli, angka ini perlu dihitung di server:

| Tempat | Angka | Catatan |
|---|---|---|
| Semua tabel | Urutan (sort) | Harus di server, karena data dibagi per halaman. Kirim parameter `urut` dan `arah` ke `/api/nprs` dan endpoint lain. |
| Filter tanggal | Tanggal TT dibuat, tanggal mulai Gamas | Tambah parameter ke `/api/tickets` dan `/api/gamas`. |
| Customer | NPR aktif, NPR bulan ini, rata-rata SLA bulan ini | Saat ini `/api/master` hanya mengirim `remote_count`. |
| Remote | NPR aktif, NPR bulan ini, SLA bulan ini, gangguan terakhir | Tambahan untuk `/api/master` atau endpoint baru. |
| Pengguna | NPR dicatat, TT dibuat, tindakan bulan ini, tindakan terakhir | Hitung dari `actions` dan `nprs` berdasarkan `user_id`. |
| Laporan SLA | Ringkasan (rata-rata, jumlah di bawah target, total downtime) | Bisa dihitung dari `rows` yang sudah dikirim `/api/sla`. |

## 6. Keputusan yang belum diambil

**Cara memindahkan desain ke `monitoring-vsat`:**

- **(a) Tailwind + shadcn/ui**, sama dengan prototipe. Kode komponen bisa dipakai hampir langsung dan hasilnya paling mirip. Kekurangannya, perubahan besar di `App.tsx` dan `App.css` serta dependensi bertambah.
- **(b) Tetap memakai CSS yang ada** (`App.css`). Dependensinya sama seperti sekarang, tapi setiap komponen dan detail (kalender, dropdown, popover) harus ditulis ulang.

Setelah pemindahan, jalankan pemeriksaan yang sama seperti tahap sebelumnya: build, lint, setup, test:api, dan browser (laptop dan HP). Setelah itu buat prompt pembaruan server untuk kp.helonoia.com.
