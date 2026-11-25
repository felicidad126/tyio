#!/usr/bin/env bash
# Memulihkan satu backup ke database KOSONG, lalu membuktikan isinya cocok dengan sumbernya.
#
#   BACKUP_PRIVATE_KEY=/aman/backup-private.asc deploy/scripts/restore.sh <berkas.tar.gpg> <url-database-tujuan>
#
# Keluar 0 hanya bila setiap tabel hasil restore punya jumlah baris dan sidik data yang sama
# dengan manifest.tsv yang dibuat saat backup (dari snapshot yang sama dengan dump).
# Database tujuan harus kosong; restore ke database yang berisi ditolak, agar tidak pernah
# menimpa data. Untuk produksi: restore ke database baru, periksa, lalu alihkan aplikasi.
#
# Variabel: BACKUP_PRIVATE_KEY (kunci privat GPG, armored), BACKUP_KEY_PASSPHRASE_FILE
# (berkas berisi passphrase kunci; kosongkan bila kunci tanpa passphrase).

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

(($# == 2)) || die "pemakaian: restore.sh <berkas.tar.gpg> <url-database-tujuan>"
backup_file="$1"
target_url="$2"
: "${BACKUP_PRIVATE_KEY:?BACKUP_PRIVATE_KEY wajib diisi (berkas kunci privat GPG)}"
[[ -r "$backup_file" ]] || die "berkas backup tidak terbaca: $backup_file"
[[ -r "$BACKUP_PRIVATE_KEY" ]] || die "kunci privat tidak terbaca: $BACKUP_PRIVATE_KEY"
require_commands psql pg_restore gpg tar diff

started=$(date +%s)
work=$(mktemp -d)
# Rumah gpg di jalur pendek: soket gpg-agent gagal dibuat bila jalurnya lebih dari ~100 karakter.
GNUPGHOME=$(mktemp -d /tmp/npr-gpg.XXXXXX)
export GNUPGHOME
trap 'stop_gpg; rm -rf "$work"' EXIT

passphrase_args=(--passphrase '')
if [[ -n "${BACKUP_KEY_PASSPHRASE_FILE:-}" ]]; then
  [[ -r "$BACKUP_KEY_PASSPHRASE_FILE" ]] || die "berkas passphrase tidak terbaca"
  passphrase_args=(--passphrase-file "$BACKUP_KEY_PASSPHRASE_FILE")
fi

log "Membuka $backup_file"
gpg --batch --quiet --pinentry-mode loopback "${passphrase_args[@]}" --import "$BACKUP_PRIVATE_KEY" 2>/dev/null ||
  die "kunci privat tidak bisa dibaca (passphrase salah?)"
mkdir "$work/payload"
# gpg memeriksa keaslian isi (MDC/AEAD): berkas yang rusak atau diubah ditolak di sini.
gpg --batch --quiet --pinentry-mode loopback "${passphrase_args[@]}" --decrypt "$backup_file" |
  tar -C "$work/payload" -xf - ||
  die "backup tidak bisa dibuka: kunci salah, atau berkas rusak/diubah"
for part in npr.dump manifest.tsv info.txt; do
  [[ -s "$work/payload/$part" ]] || die "isi backup tidak lengkap: $part tidak ada"
done
log "Isi backup: $(tr '\n' ' ' <"$work/payload/info.txt")"

existing=$(psql "${PSQL_ARGS[@]}" "$target_url" -c \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')") ||
  die "database tujuan tidak bisa dihubungi"
[[ "$existing" == "0" ]] || die "database tujuan tidak kosong ($existing objek); restore hanya ke database baru"

log "Memulihkan ke database tujuan"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_url" "$work/payload/npr.dump" ||
  die "pg_restore gagal"

psql "${PSQL_ARGS[@]}" "$target_url" -o "$work/restored.tsv" <<<"$(manifest_sql)" ||
  die "sidik data hasil restore gagal dihitung"

tables=$(wc -l <"$work/payload/manifest.tsv")
rows=$(awk -F'\t' '{ sum += $2 } END { print sum + 0 }' "$work/payload/manifest.tsv")
if ! diff -u --label "saat backup" --label "hasil restore" "$work/payload/manifest.tsv" "$work/restored.tsv" >&2; then
  die "hasil restore TIDAK COCOK dengan backup (lihat perbedaan di atas)"
fi
log "COCOK: $tables tabel, $rows baris, sidik data sama dengan saat backup ($(($(date +%s) - started)) detik)"
