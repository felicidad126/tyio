# Mockup NPR — Network Problem Report (Design canvas)

Mockup layar NPR sebagai bahan diskusi dengan user dan acuan saat membangun `apps/web`.
Ini bukan kode aplikasi: tidak ada yang di sini dipakai oleh build, lint, atau CI.

- **Lihat dan coba:** kanvas di claude.ai — https://claude.ai/artifact/LP7P65zUiut6aiBnZhEBhQ
  (privat; dibagikan lewat menu Share di halaman kanvas).
- **Sumber:** folder `project/`, persis seperti yang diterbitkan ke kanvas. Setiap layar satu
  berkas `.dc.html` (format Design Component); `project/canvas.json` menyimpan tata letak kanvas.
- **Aturan bersama:** [ATURAN.md](ATURAN.md) — istilah, label status, satuan waktu, warna, dan
  peran yang harus sama di semua layar.

## Layar

| Berkas | Layar | Pola halaman |
| --- | --- | --- |
| `Main.dc.html` | Overview | Dashboard |
| `Tiket.dc.html` | Antrean NPR dan TT | List |
| `DetailTiket.dc.html` | Detail NPR + linimasa | Detail |
| `Alert.dc.html` | Verifikasi alert | Split Pane |
| `Gamas.dc.html` | Daftar Gamas | List |
| `GamasDetail.dc.html` | Detail Gamas (Saran → Aktif → Selesai) | Detail |
| `Wall.dc.html` | Layar dinding 24/7 (1920×1080) | Dashboard, tanpa interaksi |
| `Ponsel.dc.html` | Notifikasi di ponsel (390×844) | Inbox |
| `Fondasi.dc.html` | Token warna, status, tipografi, spasi | — |
| `Segera.dc.html` | Tujuan tautan untuk layar yang belum dibuat | — |

## Mengubah mockup

1. Ubah berkas di `project/`.
2. Terbitkan ulang ke kanvas yang sama (Artifact publish dengan `root: design/mockup`).
3. Commit perubahan berkas di sini, supaya repo dan kanvas tetap sama.

Pratinjau lokal butuh runtime `support.js` milik tipe kanvas Design. Runtime itu bukan bagian
repo dan tidak di-commit; ambil dari kanvas bila perlu menguji di browser lokal.

## Catatan

- Semua nama customer, remote, orang, IP, dan nomor tiket adalah data dummy (K19, K22).
- Angka SLA dan alasan "Bukan gangguan" hanya contoh; aturannya menunggu sesi dengan user.
