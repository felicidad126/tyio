#!/usr/bin/env bash
# Membuat satu backup terenkripsi database portal.
#
#   BACKUP_DIR=/backup BACKUP_PUBLIC_KEY=/keys/backup-public.asc deploy/scripts/backup.sh
#
# Isi berkas npr-<label>-<waktu UTC>.tar.gpg (dienkripsi untuk kunci publik backup):
#   npr.dump     pg_dump format custom
#   manifest.tsv  sidik data per tabel, dihitung dari snapshot yang SAMA dengan dump,
#                 untuk membuktikan hasil restore cocok (latihan-restore.sh)
#   info.txt      waktu, sumber, versi PostgreSQL
#
# Server hanya memegang kunci PUBLIK: backup bisa dibuat tetapi tidak bisa dibuka di sini.
# Kunci privat disimpan terpisah (docs/operasi/backup.md).
#
# Variabel: PG* atau BACKUP_DATABASE_URL (koneksi), BACKUP_DIR, BACKUP_PUBLIC_KEY, BACKUP_LABEL (bawaan "db"),
# BACKUP_RETENTION_DAYS (bawaan 30; backup lebih lama dihapus setelah backup baru berhasil).

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"
: "${BACKUP_PUBLIC_KEY:?BACKUP_PUBLIC_KEY wajib diisi (berkas kunci publik GPG, armored)}"
BACKUP_LABEL="${BACKUP_LABEL:-db}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

[[ "$BACKUP_LABEL" =~ ^[a-z0-9-]+$ ]] || die "BACKUP_LABEL hanya huruf kecil, angka, dan tanda minus"
if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || ((BACKUP_RETENTION_DAYS < 1)); then
  die "BACKUP_RETENTION_DAYS harus bilangan bulat >= 1"
fi
[[ -r "$BACKUP_PUBLIC_KEY" ]] || die "kunci publik tidak terbaca: $BACKUP_PUBLIC_KEY"
require_commands psql pg_dump pg_restore gpg tar find
mkdir -p "$BACKUP_DIR"
# Koneksi: URL bila diisi, selain itu variabel PG* (libpq tidak membaca URL dari PGDATABASE).
connection=()
[[ -n "${BACKUP_DATABASE_URL:-}" ]] && connection=("$BACKUP_DATABASE_URL")
export NPR_DUMP_DB="${BACKUP_DATABASE_URL:-}"

started=$(date +%s)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/npr-$BACKUP_LABEL-$stamp.tar.gpg"
work=$(mktemp -d)
# Rumah gpg di jalur pendek: soket gpg-agent gagal dibuat bila jalurnya lebih dari ~100 karakter.
GNUPGHOME=$(mktemp -d /tmp/npr-gpg.XXXXXX)
export GNUPGHOME
trap 'stop_gpg; rm -rf "$work" "$target.tmp"' EXIT

log "Backup dimulai: $target"

# Dump dan sidik data dari snapshot yang sama: transaksi REPEATABLE READ mengekspor
# snapshot-nya, pg_dump memakainya, lalu sidik dihitung di transaksi itu juga sebelum COMMIT.
export NPR_DUMP_FILE="$work/payload/npr.dump" NPR_DUMP_STATUS="$work/dump.status"
mkdir "$work/payload"
{
  echo 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'
  echo "SELECT pg_export_snapshot() AS snapshot \\gset"
  echo '\setenv NPR_SNAPSHOT :snapshot'
  # shellcheck disable=SC2016 # dievaluasi oleh shell yang dijalankan psql, bukan di sini
  echo '\! pg_dump ${NPR_DUMP_DB:+"--dbname=$NPR_DUMP_DB"} --snapshot="$NPR_SNAPSHOT" --format=custom --compress=6 --file="$NPR_DUMP_FILE"; echo $? > "$NPR_DUMP_STATUS"'
  echo "\\o $work/payload/manifest.tsv"
  manifest_sql
  echo '\o'
  echo 'COMMIT;'
} | psql "${PSQL_ARGS[@]}" "${connection[@]}" || die "psql gagal membuat snapshot atau sidik data"

[[ "$(cat "$NPR_DUMP_STATUS" 2>/dev/null)" == "0" ]] || die "pg_dump gagal"
pg_restore --list "$NPR_DUMP_FILE" >/dev/null || die "berkas dump tidak bisa dibaca pg_restore"
[[ -s "$work/payload/manifest.tsv" ]] || die "sidik data kosong"

{
  echo "dibuat_utc=$stamp"
  echo "label=$BACKUP_LABEL"
  echo "server=$(psql "${PSQL_ARGS[@]}" "${connection[@]}" -c 'SHOW server_version')"
  echo "pg_dump=$(pg_dump --version)"
  echo "tabel=$(wc -l <"$work/payload/manifest.tsv")"
} >"$work/payload/info.txt"

# Dump custom sudah terkompresi, jadi gpg tidak perlu mengompres lagi.
tar -C "$work/payload" -cf - npr.dump manifest.tsv info.txt |
  gpg --batch --yes --quiet --trust-model always --compress-algo none \
    --recipient-file "$BACKUP_PUBLIC_KEY" --encrypt --output "$target.tmp" ||
  die "enkripsi gagal"
mv "$target.tmp" "$target"

# Hapus backup lama hanya setelah backup baru berhasil, jadi backup baik terakhir tidak
# pernah ikut terhapus walau backup gagal berhari-hari.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "npr-$BACKUP_LABEL-*.tar.gpg" \
  -mtime +"$BACKUP_RETENTION_DAYS" -print -delete | while read -r old; do log "Dihapus (lebih dari $BACKUP_RETENTION_DAYS hari): $old"; done

size=$(du -h "$target" | cut -f1)
log "Backup selesai: $target ($size, $(wc -l <"$work/payload/manifest.tsv") tabel, $(($(date +%s) - started)) detik)"
echo "$target"
