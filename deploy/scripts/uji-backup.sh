#!/usr/bin/env bash
# Uji backup.sh, restore.sh, dan latihan-restore.sh terhadap server PostgreSQL sungguhan.
# Membuat database dan kunci sementara sendiri, lalu menghapusnya. Keluar 0 bila semua lulus.
#
#   UJI_SERVER_URL=postgres://pengguna:sandi@host:5432/postgres deploy/scripts/uji-backup.sh
#
# Pengguna di UJI_SERVER_URL harus boleh CREATE DATABASE. Dipakai di CI (container image
# postgres:18 di jaringan compose staging) dan di mesin pengembang.

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
script_dir=$(cd "$(dirname "$0")" && pwd)

: "${UJI_SERVER_URL:?UJI_SERVER_URL wajib diisi}"
require_commands psql pg_dump pg_restore gpg tar diff
[[ "$UJI_SERVER_URL" =~ ^(postgres(ql)?://[^/?]+)(/[^?]*)?(\?.*)?$ ]] ||
  die "UJI_SERVER_URL harus berbentuk postgres://pengguna:sandi@host:port/database"
url_for() { echo "${BASH_REMATCH[1]}/$1${BASH_REMATCH[4]}"; }

suffix="$(date -u +%Y%m%d%H%M%S)_$$"
source_db="npr_uji_sumber_$suffix"
source_url=$(url_for "$source_db")
work=$(mktemp -d)
keys=$(mktemp -d /tmp/npr-uji-kunci.XXXXXX)
admin=("${PSQL_ARGS[@]}" "$UJI_SERVER_URL")
writer_pid=""
cleanup() {
  [[ -n "$writer_pid" ]] && kill "$writer_pid" 2>/dev/null
  psql "${admin[@]}" -c "DROP DATABASE IF EXISTS $source_db WITH (FORCE)" >/dev/null 2>&1 || true
  GNUPGHOME="$keys/gnupg" gpgconf --kill gpg-agent >/dev/null 2>&1 || true
  rm -rf "$work" "$keys"
}
trap cleanup EXIT

passed=0
failed=0
check() {
  local name="$1"
  shift
  if "$@"; then
    log "LULUS  $name"
    passed=$((passed + 1))
  else
    log "GAGAL  $name"
    failed=$((failed + 1))
  fi
}
# Perintah yang HARUS gagal dengan pesan tertentu.
expect_failure() {
  local pattern="$1"
  shift
  local output
  if output=$("$@" 2>&1); then
    log "  (seharusnya gagal, tetapi berhasil)"
    return 1
  fi
  grep -q -- "$pattern" <<<"$output" || {
    log "  (gagal, tetapi tanpa pesan \"$pattern\"):"
    printf '%s\n' "$output" | tail -n 5 >&2
    return 1
  }
}

make_key() {
  local name="$1"
  GNUPGHOME="$keys/gnupg" gpg --batch --quiet --passphrase '' \
    --quick-gen-key "NPR Uji $name <uji-$name@npr.invalid>" future-default default never 2>/dev/null
  local fpr
  fpr=$(GNUPGHOME="$keys/gnupg" gpg --list-keys --with-colons "uji-$name@npr.invalid" | awk -F: '/^fpr/ { print $10; exit }')
  GNUPGHOME="$keys/gnupg" gpg --armor --export "$fpr" >"$keys/$name-public.asc"
  GNUPGHOME="$keys/gnupg" gpg --batch --pinentry-mode loopback --passphrase '' --armor \
    --export-secret-keys "$fpr" >"$keys/$name-private.asc"
}

run_backup() {
  local url="$1" out="$2"
  BACKUP_DATABASE_URL="$url" BACKUP_DIR="$out" BACKUP_PUBLIC_KEY="$keys/utama-public.asc" BACKUP_LABEL=uji \
    "$script_dir/backup.sh" 2>"$work/backup.log"
}

drill() {
  BACKUP_PRIVATE_KEY="${2:-$keys/utama-private.asc}" RESTORE_SERVER_URL="$UJI_SERVER_URL" \
    "$script_dir/latihan-restore.sh" "$1"
}

log "Menyiapkan database sumber $source_db dan kunci uji"
mkdir -m 700 "$keys/gnupg"
make_key utama
make_key lain
psql "${admin[@]}" -c "CREATE DATABASE $source_db" >/dev/null
# Skema kecil dengan tipe yang ada di portal, termasuk trigger yang menolak INSERT tanpa
# konteks (seperti trigger audit): restore harus memuat data SEBELUM trigger dibuat.
psql "${PSQL_ARGS[@]}" "$source_url" >/dev/null <<'SQL'
CREATE TABLE remotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  sidik bytea,
  dibuat timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kejadian (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, catatan text);
CREATE FUNCTION tolak_tanpa_konteks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('npr.source', true), '') = '' THEN
    RAISE EXCEPTION 'tanpa konteks';
  END IF;
  RETURN NEW;
END $$;
INSERT INTO remotes (nama, data, sidik)
SELECT 'Remote ' || g || E'\tdengan tab\ndan baris baru', jsonb_build_object('n', g, 'zona', 'WITA'), sha256(g::text::bytea)
FROM generate_series(1, 2000) AS g;
INSERT INTO kejadian (catatan) SELECT 'awal ' || g FROM generate_series(1, 500) AS g;
CREATE TRIGGER jaga AFTER INSERT ON remotes FOR EACH ROW EXECUTE FUNCTION tolak_tanpa_konteks();
SQL

# 1. Backup biasa lalu latihan restore.
check "backup berhasil dibuat" run_backup "$source_url" "$work/a"
first=$(newest_backup "$work/a")
check "latihan restore keluar 0 untuk backup yang utuh" drill "$first"

# 2. Data terus ditulis selama backup: dump dan sidik data harus dari snapshot yang sama.
(
  while true; do
    psql "${PSQL_ARGS[@]}" "$source_url" -c "INSERT INTO kejadian (catatan) SELECT 'saat backup' FROM generate_series(1, 50)" >/dev/null 2>&1 || true
  done
) &
writer_pid=$!
sleep 1
run_backup "$source_url" "$work/b" >/dev/null
kill "$writer_pid" 2>/dev/null
wait "$writer_pid" 2>/dev/null || true
writer_pid=""
check "backup saat data terus ditulis tetap cocok" drill "$(newest_backup "$work/b")"

# 3. Berkas rusak atau diubah ditolak.
cp "$first" "$work/rusak.tar.gpg"
size=$(stat -c %s "$work/rusak.tar.gpg")
printf '\xff\x00\xff' | dd of="$work/rusak.tar.gpg" bs=1 seek=$((size / 2)) conv=notrunc status=none
check "berkas yang diubah ditolak" expect_failure "tidak bisa dibuka" drill "$work/rusak.tar.gpg"

# 4. Kunci yang salah ditolak.
check "kunci privat yang salah ditolak" expect_failure "tidak bisa dibuka" drill "$first" "$keys/lain-private.asc"

# 5. Isi yang berbeda dari manifest terdeteksi (manifest diubah lalu dienkripsi ulang).
mkdir "$work/ubah"
GNUPGHOME="$keys/gnupg" gpg --batch --quiet --pinentry-mode loopback --passphrase '' --decrypt "$first" |
  tar -C "$work/ubah" -xf -
awk -F'\t' 'BEGIN { OFS = "\t" } $1 == "remotes" { $2 = $2 + 1 } { print }' "$work/ubah/manifest.tsv" >"$work/ubah/m" &&
  mv "$work/ubah/m" "$work/ubah/manifest.tsv"
tar -C "$work/ubah" -cf - npr.dump manifest.tsv info.txt |
  GNUPGHOME="$keys/gnupg" gpg --batch --quiet --trust-model always --recipient-file "$keys/utama-public.asc" \
    --encrypt --output "$work/beda.tar.gpg"
check "isi yang tidak cocok dengan manifest terdeteksi" expect_failure "TIDAK COCOK" drill "$work/beda.tar.gpg"

# 6. Restore ke database yang berisi ditolak (tidak pernah menimpa data).
check "restore ke database berisi ditolak" expect_failure "tidak kosong" \
  env BACKUP_PRIVATE_KEY="$keys/utama-private.asc" "$script_dir/restore.sh" "$first" "$source_url"

# 7. Backup lama dihapus setelah backup baru berhasil; yang baru tetap ada.
mkdir -p "$work/c"
touch -d '40 days ago' "$work/c/npr-uji-20000101T000000Z.tar.gpg"
touch -d '2 days ago' "$work/c/npr-uji-20000102T000000Z.tar.gpg"
run_backup "$source_url" "$work/c" >/dev/null
check "backup lebih dari 30 hari dihapus, yang lebih baru disimpan" bash -c "
  [[ ! -e '$work/c/npr-uji-20000101T000000Z.tar.gpg' && -e '$work/c/npr-uji-20000102T000000Z.tar.gpg' ]] &&
  (( \$(find '$work/c' -name 'npr-uji-*.tar.gpg' | wc -l) == 2 ))"

# 8. Berkas backup hanya bisa dibaca pemiliknya.
check "berkas backup bermode 600" bash -c "[[ \$(stat -c %a '$first') == 600 ]]"

log "Selesai: $passed lulus, $failed gagal"
((failed == 0))
