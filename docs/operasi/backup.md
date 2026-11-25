# Backup dan restore

Untuk operator staging dan produksi. Skrip ada di [`deploy/scripts/`](../../deploy/scripts/);
service `backup` ada di [`deploy/compose.staging.yml`](../../deploy/compose.staging.yml) dan
[`deploy/compose.prod.yml`](../../deploy/compose.prod.yml) (berkas `tyio-produksi-<waktu>.tar.gpg`;
di produksi ganti `$STAGING` dengan `$PROD` dari [produksi.md](produksi.md)).

## Ringkasnya

| | |
| --- | --- |
| Isi | Database PostgreSQL utuh: semua tabel, termasuk jejak audit. Lampiran berkas (T8) belum ada; ditambahkan ke backup saat R1 menambah penyimpanan berkas |
| Jadwal | Setiap hari 01:30 WIB (18:30 UTC, ubah dengan `TYIO_BACKUP_TIME_UTC`). Saat service `backup` pertama kali menyala, langsung dibuat backup bila belum ada backup dalam 24 jam terakhir |
| Tempat | Folder `TYIO_BACKUP_DIR` di server (bawaan `deploy/backup/`), berkas `tyio-staging-<waktu UTC>.tar.gpg`, hanya bisa dibaca root (mode 600) |
| Lama simpan | 30 hari (`TYIO_BACKUP_RETENTION_DAYS`). Backup lama dihapus hanya setelah backup baru berhasil, jadi backup baik terakhir tidak pernah ikut terhapus |
| Enkripsi | GPG dengan kunci publik. Server hanya memegang kunci **publik**: bisa membuat backup, tidak bisa membukanya. Kunci privat disimpan di luar server |
| Bukti isi | Setiap backup membawa sidik data per tabel (jumlah baris dan hash isi) dari snapshot yang sama dengan dump. Restore dianggap berhasil hanya bila sidiknya cocok |
| Pemantauan | `docker compose ps`: service `backup` **healthy** bila ada backup kurang dari 26 jam. Log: `docker compose logs backup` |
| RPO / RTO | Usulan: data hilang paling banyak 24 jam (backup harian). Waktu pulih diukur di setiap latihan restore (tabel di bawah). Keduanya perlu disepakati dengan customer (checklist A5) |

Perintah di bawah memakai singkatan ini (jalankan dari folder repo di server):

```bash
STAGING="docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml"
```

## Kunci backup (sekali, oleh pemegang kunci, bukan di server)

Tunjuk dua pemegang kunci. Buat pasangan kunci di laptop salah satunya:

```bash
gpg --quick-gen-key "Tyio Backup <backup@perusahaan.co.id>" future-default default never
gpg --armor --export backup@perusahaan.co.id > backup-public.asc
gpg --armor --export-secret-keys backup@perusahaan.co.id > backup-private.asc
```

- Saat diminta, beri **passphrase** yang kuat. Simpan `backup-private.asc` dan passphrase-nya
  di dua tempat terpisah yang dipegang dua pemegang kunci (mis. pengelola kata sandi
  perusahaan dan salinan offline). **Jangan** taruh kunci privat di server.
- Salin hanya `backup-public.asc` ke server, ke `deploy/kunci/backup-public.asc` (diabaikan
  git), lalu isi `TYIO_BACKUP_PUBLIC_KEY` di `deploy/staging.env`.
- Tanpa kunci privat, backup tidak bisa dibuka oleh siapa pun. Kehilangan kunci privat =
  kehilangan semua backup; karena itu dua salinan.

## Backup manual

Selain jadwal harian, mis. sebelum rilis besar:

```bash
$STAGING exec backup /scripts/backup.sh
```

## Latihan restore

Membuktikan backup bisa dipulihkan ke server **bersih** dan isinya cocok. Wajib paling sedikit
setahun sekali (POJK 11/POJK.03/2022: rencana pemulihan bencana diuji paling sedikit 1 kali
dalam 1 tahun); disarankan setiap 3 bulan dan setelah perubahan besar. CI juga menjalankannya
otomatis di setiap push (job `image`), terhadap data staging yang baru di-seed.

Di mesin yang punya Docker dan kunci privat (laptop pemegang kunci, atau server dengan kunci
yang dibawa sementara):

```bash
sudo BACKUP_DIR=/srv/tyio/deploy/backup \
     BACKUP_PRIVATE_KEY=/media/aman/backup-private.asc \
     BACKUP_KEY_PASSPHRASE_FILE=/media/aman/passphrase.txt \
     deploy/scripts/latihan-restore.sh
```

- Tanpa argumen dipakai backup terbaru; atau sebutkan berkasnya sebagai argumen.
- Skrip menyalakan container PostgreSQL baru (image sama dengan staging), memulihkan backup ke
  situ, membandingkan sidik data, lalu membuang container. Keluar **0** dan mencetak
  `COCOK: <n> tabel, <n> baris` bila berhasil; bukan 0 bila backup rusak, kunci salah, atau
  isi tidak cocok.
- Tanpa Docker: isi `RESTORE_SERVER_URL=postgres://pengguna:sandi@host:5432/postgres` (server
  lain yang boleh membuat database); database sementara dibuat lalu dihapus.
- Setiap latihan ditambahkan ke `latihan-restore.log` di folder backup. Salin hasilnya ke
  tabel [Riwayat latihan restore](#riwayat-latihan-restore).
- Skrip sendiri diuji `deploy/scripts/uji-backup.sh` (berkas rusak, kunci salah, isi tidak
  cocok, restore ke database berisi, retensi); CI menjalankannya di setiap push.

## Restore sungguhan (bencana atau data rusak)

Restore selalu ke database **baru**; `restore.sh` menolak database yang berisi, jadi data
yang ada tidak pernah tertimpa. Perubahan setelah waktu backup hilang (lihat RPO).

1. Hentikan aplikasi: `$STAGING stop app`.
2. Bawa kunci privat ke server sementara, mis. `/root/pulih/backup-private.asc` (+ berkas passphrase).
3. Buat database kosong dan pulihkan backup ke situ:

   ```bash
   $STAGING exec db createdb -U tyio tyio_pulih
   $STAGING run --rm --no-deps \
     -v /root/pulih:/pulih:ro \
     -e BACKUP_PRIVATE_KEY=/pulih/backup-private.asc \
     -e BACKUP_KEY_PASSPHRASE_FILE=/pulih/passphrase.txt \
     --entrypoint /scripts/restore.sh backup \
     /backup/tyio-staging-<waktu>.tar.gpg postgres://tyio@db/tyio_pulih
   ```

   Lanjutkan hanya bila tercetak `COCOK`.
4. Tukar database (tidak ada koneksi lain ke keduanya):

   ```bash
   $STAGING exec db psql -U tyio -d postgres -c 'ALTER DATABASE tyio RENAME TO tyio_sebelum_pulih' \
     -c 'ALTER DATABASE tyio_pulih RENAME TO tyio'
   ```

5. Jalankan migrasi (bila kode lebih baru dari backup), lalu nyalakan aplikasi:
   `$STAGING up -d --wait`.
6. Hapus kunci privat dari server (`shred -u /root/pulih/*`). Simpan `tyio_sebelum_pulih`
   sampai penyebab kerusakan diperiksa, lalu hapus.
7. Catat kejadian, waktu backup yang dipakai, dan lama pemulihan di tabel di bawah.

## Riwayat latihan restore

| Tanggal | Lingkungan | Backup | Hasil | Lama | Oleh |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | Lokal, PostgreSQL 18.7 (server terpisah, database sementara) | `tyio-lokal-20261119T141916Z` | COCOK: 7 tabel, 437 baris | < 1 detik | Langkah 0.6 (Claude) |
| 2026-11-19 | CI run #81: container PostgreSQL baru, data staging hasil seed dan uji layar | `tyio-staging-20261119T142738Z` | COCOK: 7 tabel, 74 baris | ± 7 detik (termasuk menyalakan container) | CI |
| Setiap push | CI, seperti di atas | backup terbaru dari service `backup` | Job `image` gagal bila tidak cocok | — | CI |
| Belum | Server staging sungguhan | — | Menunggu keputusan hosting | — | — |

## Belum (menunggu keputusan hosting)

- **Salinan di lokasi kedua** di Indonesia (POJK 11/2022: pusat data dan pusat pemulihan bencana
  di Indonesia). Sampai itu ada, backup hanya ada di server yang sama dengan database.
- ~~Replika database di produksi~~: produksi satu server tanpa replika (T155); backup harian
  tetap berjalan di sana (service `backup` di `deploy/compose.prod.yml`).
- **Peringatan** ke operator bila backup gagal (sekarang hanya status `unhealthy`); bersama
  pemantauan server atau notifikasi R5.
- Latihan restore di server staging sungguhan.
