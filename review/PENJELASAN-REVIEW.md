# Penjelasan Hasil Review Program NPR

Dokumen ini menjelaskan hasil review program "Monitoring VSAT & M2M" (nanti bernama **Network
Problem Report** atau **NPR**) dengan bahasa sehari-hari, untuk pembaca yang tidak menulis kode.
Rincian teknisnya ada di [REVIEW-NPR.md](REVIEW-NPR.md). Kode di dalam kurung, misalnya (K-03),
adalah nomor temuan di dokumen itu.

## Apa yang direview

NPR adalah aplikasi web untuk helpdesk PT. Tangara Mitrakom. Isinya:

- mencatat gangguan jaringan di lokasi ATM (satu laporan gangguan disebut NPR);
- mencatat setiap tindakan penanganan sampai gangguan selesai;
- membuat Trouble Ticket (TT) untuk teknisi lapangan;
- mencatat Gamas, yaitu gangguan massal yang mengenai banyak lokasi sekaligus;
- menghitung SLA, yaitu persentase waktu jaringan berjalan normal dalam sebulan.

Programnya dijalankan dan dicoba langsung, termasuk dibuka di layar laptop dan HP, lalu setiap
bagiannya dibaca.

## Kesimpulan singkat

Program ini **sudah berjalan dan dasarnya aman**. Semua pemeriksaan otomatis lulus. Masalahnya
bukan program yang rusak, melainkan hal-hal yang akan terasa ketika aplikasi dipakai setiap hari
oleh helpdesk.

Temuannya bisa dikelompokkan menjadi empat:

1. **Data dan laporan** bisa tercatat salah dalam beberapa keadaan.
2. **Kenyamanan kerja**: tulisan kecil dan pucat, ada menu yang isinya dobel, dan halaman utama
   kurang membantu.
3. **Kesan "dibuat AI"**: gaya bahasa dan tampilan terasa umum, belum seperti dibuat orang yang
   paham pekerjaan helpdesk.
4. **Ganti nama** menjadi NPR dan pemasangan logo PT. Tangara Mitrakom.

## Yang sudah baik

Bagian-bagian ini sudah benar dan sebaiknya tidak diubah:

- **Password disimpan dengan aman.** Password tidak disimpan apa adanya, tapi diacak dengan cara
  yang sulit dibongkar.
- **Login dibatasi.** Jika seseorang mencoba menebak password berkali-kali, aplikasi akan
  menolaknya untuk sementara.
- **Sesi login berakhir sendiri** setelah 8 jam.
- **Data tidak bisa dibobol lewat isian form.** Teknik serangan yang umum lewat kotak isian sudah
  ditutup.
- **Aturan kerja sudah dijaga.** Contohnya, NPR yang sudah ditutup tidak bisa diubah, tindakan
  tidak boleh bertanggal mundur, dan laporan teknisi wajib ada sebelum NPR ditutup.
- **Hitungan SLA adil.** Jika satu lokasi terkena NPR dan Gamas pada jam yang sama, waktu gangguan
  tidak dihitung dua kali.
- **Waktu memakai WIB** di tampilan dan isian.

## Masalah yang paling penting

Tujuh temuan ini berdampak langsung ke data, laporan, atau pekerjaan harian.

### 1. Aplikasi akan makin lambat seiring waktu (K-01)

Setiap kali pengguna menekan Simpan, aplikasi mengambil ulang **seluruh** isi database dari
server, termasuk semua foto dan PDF lampiran. Ibaratnya, setiap kali menambah satu lembar ke
map arsip, seluruh lemari arsip difotokopi ulang.

Sekarang belum terasa karena datanya sedikit. Setelah ada 100 lampiran, satu kali Simpan bisa
mengunduh sekitar 68 MB. Lewat jaringan kantor atau HP, aplikasi akan terasa sangat lambat.

**Saran:** aplikasi hanya mengambil data yang sedang ditampilkan, dan lampiran baru diambil saat
dibuka.

### 2. Nomor NPR panjang dan acak (K-02)

Nomor NPR sekarang seperti ini: `NPR/2026/11/1795619811268455`. Enam belas angka acak sulit
dibacakan lewat telepon ke PIC atau teknisi. Selain itu:

- ada peluang kecil dua NPR mendapat nomor yang sama, dan pengguna mendapat pesan error;
- bulan pada nomor memakai jam internasional, bukan WIB, sehingga NPR yang dibuat tanggal
  1 Desember pukul 00.00–06.59 WIB bernomor November.

**Saran:** nomor urut per bulan, misalnya `NPR/2026/11/0001`, `NPR/2026/11/0002`, dan seterusnya.

### 3. Status "Eskalasi" hilang sendiri (K-03)

Ketika NPR sudah dieskalasi ke teknisi, statusnya menjadi ESKALASI. Tapi begitu helpdesk mencatat
tindakan lain, misalnya catatan perkembangan, status berubah sendiri menjadi PENDING.

Akibatnya, saat helpdesk menyaring daftar untuk melihat NPR yang sedang ditangani teknisi, NPR
tersebut tidak muncul. Jumlah eskalasi di laporan juga jadi salah.

**Saran:** status tetap ESKALASI selama ada TT yang belum ditutup.

### 4. Tulisan terlalu kecil (U-01)

Hampir semua tulisan berukuran 9–12 piksel, lebih kecil dari tulisan di kebanyakan situs. Helpdesk
menatap layar ini sepanjang shift, dan nomor NPR serta nama lokasi sulit dibaca.

**Saran:** ukuran dasar 14 piksel, dan paling kecil 12 piksel.

### 5. Tulisan abu-abu terlalu pucat (U-02)

Banyak keterangan ditulis abu-abu muda di atas latar putih, sehingga sulit dibaca, apalagi di
layar yang kurang terang. Yang paling pucat justru data penting di form NPR baru: alamat, PIC, dan
IP lokasi.

**Saran:** gelapkan warna abu-abu sampai memenuhi standar keterbacaan.

### 6. Dua menu berisi daftar yang sama (X-01)

Menu "Detail NPR" ternyata berisi **daftar** NPR, dan menu "Report NPR" berisi daftar yang sama
ditambah filter tanggal. Pengguna baru akan bingung harus membuka yang mana.

**Saran:** gabung menjadi satu menu "NPR", lalu rapikan susunan menu menjadi: Dashboard, NPR,
Trouble Ticket, Gamas, Laporan SLA, dan Data Master.

### 7. Halaman utama hanya berisi angka (X-02)

Halaman Dashboard menampilkan angka seperti "Critical lebih dari 48 jam: 3", tapi angka itu tidak
bisa diklik dan tidak ada daftar NPR mana saja yang dimaksud. Helpdesk harus mencarinya sendiri di
menu lain.

Selain itu, setiap NPR baru langsung tercatat "Pending Customer", padahal belum ada yang memutuskan
penyebabnya.

**Saran:** angka bisa diklik untuk membuka daftar NPR terkait, ditambah tabel kecil "NPR aktif
paling lama" di Dashboard. NPR baru dibiarkan tanpa kategori sampai helpdesk memilih.

## Masalah lain yang perlu dirapikan

Temuan berikut tidak mendesak, tapi membuat aplikasi lebih nyaman dan lebih meyakinkan.

**Data dan perhitungan**

- Gamas bisa ditutup tanpa mengisi jam kembali online. Jika dikosongkan, aplikasi memakai jam saat
  tombol ditekan, sehingga waktu gangguan tercatat lebih lama dari kenyataan (K-04).
- Laporan SLA bulanan terbuka di bulan yang salah pada dini hari tanggal 1 (K-05).
- Beberapa aturan isian berbeda antara form dan server. Pengguna baru tahu isiannya salah setelah
  menekan Simpan (K-08).
- Jika server sedang gangguan, pengguna melihat pesan error teknis yang tidak bisa dipahami (K-09).

**Tampilan**

- Ikon menu berupa simbol acak yang bentuknya berbeda di tiap komputer (U-04).
- Di HP, menu terpotong dan tabel harus digeser ke samping (U-05).
- Setiap halaman diawali blok judul besar yang isinya hampir sama di semua halaman (U-06).
- Form NPR baru mencampur kotak yang harus diisi dengan kotak yang hanya untuk dibaca, dengan
  ukuran dan bentuk yang sama (U-07).
- Angka SLA ditulis "100.000%". Dengan cara baca Indonesia, ini terbaca seratus ribu persen
  (U-10).
- Kartu "Menunggu Report" berwarna hijau, padahal hijau biasanya berarti selesai (U-11).

**Alur kerja**

- Form tindakan menampilkan semua isian untuk semua jenis tindakan. Contohnya, saat menutup NPR,
  form tetap meminta kategori pending (X-03).
- Setelah membuat NPR baru, pengguna dibawa ke daftar, bukan ke NPR yang baru dibuat (X-04).
- Data customer dan lokasi tidak bisa diubah jika salah ketik (X-05).
- Memilih lokasi yang terkena Gamas harus dicentang satu per satu dari daftar panjang tanpa kotak
  pencarian (X-06).
- PDF untuk teknisi langsung terunduh tanpa diminta, dan isinya masih teks polos tanpa kop, tabel,
  atau tempat tanda tangan (X-07).
- Bahasa label bercampur Inggris dan Indonesia, misalnya "Address" di sebelah "Catatan awal
  gangguan" (X-10).

**Kerapian kode**

Ada juga temuan yang hanya terlihat oleh pembuat program, misalnya satu berkas yang terlalu
panjang, kode yang ditulis terlalu padat, dan sisa berkas contoh yang tidak dipakai (K-06, K-07,
K-10 sampai K-14). Bagian ini tidak mengubah tampilan, tapi penting supaya kodenya mudah dijelaskan
saat sidang Kerja Praktek.

## Kesan "dibuat AI"

Beberapa bagian terasa seperti hasil alat AI, bukan dibuat oleh orang yang paham pekerjaan
helpdesk (H-01 sampai H-09). Contohnya:

- halaman login seperti iklan, dengan slogan dan daftar fitur bernomor;
- keterangan "data dummy", "data fiktif", atau "simulasi" diulang sampai 10 kali, termasuk pada
  label isian seperti "Telepon dummy";
- keterangan yang hanya mengulang judul, misalnya kartu "NPR Aktif" diberi keterangan "Seluruh
  gangguan yang belum ditutup";
- catatan yang menjelaskan cara kerja sistem ke pengguna, padahal pengguna tidak perlu tahu;
- berkas `HASIL-PEMERIKSAAN.md` yang berisi laporan kerja alat AI, bukan hasil uji sendiri;
- tampilan seperti template dashboard pada umumnya, belum memakai logo dan warna perusahaan.

Tujuan perbaikan ini bukan menyembunyikan penggunaan AI. Tujuannya supaya aplikasi terasa
benar-benar milik helpdesk PT. Tangara Mitrakom, dan setiap bagiannya bisa dijelaskan sendiri saat
sidang. Jika kampus punya aturan soal penggunaan AI, aturan itu tetap diikuti.

## Ganti nama dan logo

- Nama aplikasi menjadi **Network Problem Report**, nama pendek **NPR**.
- Nama perusahaan ditulis **PT. Tangara Mitrakom** (dengan titik).
- Logo perusahaan dipasang di halaman login, menu samping, ikon tab browser, dan kop PDF.
- Warna aplikasi disesuaikan dengan warna logo (biru tua).

Ada dua hal yang perlu diperhatikan:

1. **Logo yang ada berlatar putih.** Menu samping dan halaman login berwarna gelap, jadi logo akan
   tampil sebagai kotak putih. Sebaiknya ada versi logo berlatar transparan.
2. **Sebagian nama tidak terlihat pengguna, tapi dipakai di sistem online.** Contohnya alamat
   website dan nama database. Jika diganti, alamat lama berhenti bekerja atau data perlu
   dipindahkan. Sebaiknya bagian ini dibiarkan.

## Keputusan yang perlu diambil

Sebelum perbaikan dikerjakan, ada delapan pertanyaan yang perlu dijawab:

| No. | Pertanyaan | Pilihan |
| --- | --- | --- |
| D-1 | Tulisan "Proyek Kerja Praktek" dan "data fiktif" tetap ditampilkan? | di semua tempat / cukup di halaman login / dihapus |
| D-2 | Nama teknis di sistem online ikut diganti? | hanya yang terlihat pengguna / sebagian / semuanya |
| D-3 | Akun pengguna | tetap satu akun pribadi / satu akun umum "helpdesk" / akun per orang |
| D-4 | Aplikasi perlu nyaman dipakai di HP? | cukup laptop / HP juga |
| D-5 | Tulisan "VSAT & M2M" tetap ada? | ya / tidak |
| D-6 | Format nomor NPR | urut per bulan input / urut per bulan gangguan / dibiarkan |
| D-7 | PDF untuk teknisi | cukup ditambah logo / kop, tabel, dan tempat tanda tangan |
| D-8 | Bahasa label | Indonesia, istilah kerja tetap / Inggris semua / dibiarkan |

## Langkah berikutnya

1. Jawab delapan pertanyaan di atas dan tentukan temuan mana yang akan diperbaiki.
2. Perbaikan dimulai dari tujuh masalah paling penting.
3. Setelah setiap perbaikan, aplikasi diuji ulang di laptop dan HP.
