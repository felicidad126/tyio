# Produksi satu server

Untuk operator produksi. Produksi berjalan di **satu server** tanpa replika database atau
failover (langkah 1.7, disederhanakan T155). Perlindungan data = backup harian terenkripsi dan
latihan restore ([backup.md](backup.md)).

Berkas: [`deploy/compose.prod.yml`](../../deploy/compose.prod.yml),
[`deploy/Caddyfile`](../../deploy/Caddyfile), [`deploy/prod.env.example`](../../deploy/prod.env.example),
[`deploy/scripts/uji-produksi.sh`](../../deploy/scripts/uji-produksi.sh).

## Yang berjalan

| Service | Isi | Dibuka ke luar |
| --- | --- | --- |
| `caddy` | Penutup HTTPS (Caddy 2.11.8): sertifikat, HTTP → HTTPS, HSTS, kompresi | Port 80 dan 443 |
| `app` | Portal NOC (API + web), `TYIO_ENV=production` | Tidak; hanya lewat Caddy |
| `migrate` | Menjalankan migrasi database setiap kali dinyalakan, lalu berhenti | — |
| `db` | PostgreSQL 18, data di volume `tyio-prod_db-data` | Tidak |
| `backup` | Backup terenkripsi harian 01:30 WIB ke `deploy/backup/` | — |

Image aplikasi **dibangun di server** dari commit yang sudah lolos CI (T157), diberi tag
`tyio-app:<commit pendek>`. Image versi sebelumnya tetap ada di server untuk kembali.
Seed data dummy ditolak di produksi; untuk mencoba dengan data dummy pakai staging
([menjalankan.md](menjalankan.md#staging)).

## Kebutuhan server

- Linux x86_64 (mis. Ubuntu 24.04 atau Debian 12/13), 2 vCPU, RAM 4 GB, disk 40 GB.
- Docker Engine dengan plugin Compose v2 (`docker compose version`), `git`, `curl`.
- Akses keluar ke `github.com`, Docker Hub, dan `registry.npmjs.org` saat membangun image.
  Di jaringan dengan proxy pemeriksa TLS, lihat
  [menjalankan.md](menjalankan.md#jaringan-kantor-dengan-proxy-pemeriksa-tls).
- Port 80 dan 443 terbuka dari jaringan pengguna (kantor/VPN, atau internet bila memakai
  Let's Encrypt). Port lain tidak perlu dibuka.

## Memasang pertama kali

Semua perintah dijalankan sebagai root (atau anggota grup `docker`) dari folder repo, mis.
`/opt/tyio`. Singkatan:

```bash
PROD="docker compose --env-file deploy/prod.env -f deploy/compose.prod.yml"
```

1. **Ambil kode** (repo privat) dengan *deploy key* hanya-baca khusus repo ini, bukan token akun
   (T161):

   ```bash
   ssh-keygen -t ed25519 -N '' -C "tyio-deploy@$(hostname)" -f /root/.ssh/tyio_deploy
   cat /root/.ssh/tyio_deploy.pub    # tempel di GitHub: repo › Settings › Deploy keys › Add (tanpa write access)
   GIT_SSH_COMMAND='ssh -i /root/.ssh/tyio_deploy -o IdentitiesOnly=yes' \
     git clone git@github.com:felicidad126/tyio.git /opt/tyio
   cd /opt/tyio
   git config core.sshCommand 'ssh -i /root/.ssh/tyio_deploy -o IdentitiesOnly=yes'
   git checkout <commit yang lolos CI>
   ```

2. **Kunci backup:** pemegang kunci membuat pasangan kunci di laptopnya
   ([backup.md](backup.md#kunci-backup-sekali-oleh-pemegang-kunci-bukan-di-server)). Hanya
   kunci **publik** yang disalin ke server, ke `deploy/kunci/backup-public.asc`.

3. **Isi `deploy/prod.env`:**

   ```bash
   cp deploy/prod.env.example deploy/prod.env && chmod 600 deploy/prod.env
   sed -i "s/^TYIO_DB_PASSWORD=.*/TYIO_DB_PASSWORD=$(openssl rand -hex 24)/" deploy/prod.env
   ```

   Lalu isi `TYIO_HOST` (nama host atau IP yang diketik pengguna) dan `TYIO_TLS`:

   | `TYIO_TLS` | Kapan | Yang perlu disiapkan |
   | --- | --- | --- |
   | `internal` | Intranet/VPN tanpa sertifikat dari IT | Root CA Caddy dipasang sekali di setiap perangkat (langkah 6) |
   | email admin, mis. `admin@perusahaan.co.id` | Domain publik | DNS domain mengarah ke server; port 80 dan 443 terbuka dari internet |
   | `"/certs/cert.pem /certs/key.pem"` | Sertifikat dari CA kantor | Taruh berkas di `deploy/certs/` (rangkaian lengkap di `cert.pem`), `chmod 600` kuncinya |

4. **Bangun dan nyalakan:**

   ```bash
   export TYIO_IMAGE=tyio-app:$(git rev-parse --short HEAD)
   $PROD up -d --build --wait
   ```

   Membangun image pertama kali ±3–5 menit. `--wait` selesai setelah semua service sehat,
   termasuk backup pertama.

5. **Admin pertama** (kata sandi diminta dua kali tanpa ditampilkan, minimal 12 karakter):

   ```bash
   $PROD run --rm app node dist/modules/users/create-user.js --email admin@perusahaan.co.id --name "Nama Admin" --role admin
   ```

   Pengguna lain dibuat dengan perintah yang sama (`--role l1|l2|admin`, `--tenants BNA,BAD`
   untuk membatasi customer). Setelah itu admin mengisi customer dan data master di portal,
   lalu mengimpor remote dari Excel.

6. **Hanya untuk `TYIO_TLS=internal`:** ambil root CA dan pasang di setiap perangkat pengguna
   (Windows: *Trusted Root Certification Authorities*; macOS: Keychain, *Always Trust*;
   Android/iOS: profil sertifikat). Tanpa ini peramban memberi peringatan dan aplikasi tidak bisa
   dipasang.

   ```bash
   $PROD exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > tyio-root-ca.crt
   ```

7. **Uji asap** (tidak mengubah data):

   ```bash
   deploy/scripts/uji-produksi.sh
   # dengan login dan aliran pembaruan langsung:
   read -rs UJI_PASSWORD && export UJI_PASSWORD UJI_EMAIL=admin@perusahaan.co.id
   deploy/scripts/uji-produksi.sh
   ```

   Harus berakhir `Selesai: <n> lulus, 0 gagal`. Lalu buka `https://<TYIO_HOST>` di peramban.

8. **Firewall:** buka hanya 80/443 (dan SSH untuk admin server). Port database dan aplikasi
   memang tidak dibuka ke host.

## Memperbarui ke versi baru

```bash
cd /opt/tyio
$PROD exec -T backup /scripts/backup.sh          # backup manual sebelum memperbarui
git fetch && git checkout <commit baru yang lolos CI>
export TYIO_IMAGE=tyio-app:$(git rev-parse --short HEAD)
$PROD up -d --build --wait                       # migrasi baru berjalan otomatis
deploy/scripts/uji-produksi.sh
```

Kembali ke versi sebelumnya hanya aman bila versi baru tidak membawa migrasi database:
`git checkout <commit lama>`, `export TYIO_IMAGE=tyio-app:<commit lama pendek>`,
`$PROD up -d --no-build --wait`. Bila ada migrasi, pulihkan dari backup manual tadi
([backup.md](backup.md#restore-sungguhan-bencana-atau-data-rusak)).

## Sehari-hari

- Status: `$PROD ps` (semua `healthy`; `backup` unhealthy = tidak ada backup 26 jam terakhir).
- Log: `$PROD logs -f --tail 200 app caddy`.
- Backup ada di `deploy/backup/` (perintah backup dan restore di [backup.md](backup.md), dengan
  `$PROD` sebagai pengganti `$STAGING`). Latihan restore minimal sebulan sekali di mesin lain
  yang memegang kunci privat.
- Membersihkan image lama: `docker image ls tyio-app` lalu `docker image rm tyio-app:<tag>`
  (simpan dua versi terakhir).

## Tidak dicakup (T155)

- Server kedua, replika database, failover otomatis, pemantauan dari luar.
- **Salinan backup di lokasi kedua** belum ditentukan: sampai itu ada, backup hanya di server yang
  sama, jadi kerusakan disk atau server bisa menghilangkan data (risiko terbuka, T159).
