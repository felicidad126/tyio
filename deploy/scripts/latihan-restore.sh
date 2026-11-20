#!/usr/bin/env bash
# Latihan restore (langkah 0.6, POJK 11/2022: rencana pemulihan diuji paling sedikit setahun
# sekali). Memulihkan satu backup ke server PostgreSQL BERSIH lalu membuktikan isinya cocok.
# Keluar 0 bila cocok; selain itu bukan 0.
#
#   BACKUP_DIR=/srv/tyio/backup BACKUP_PRIVATE_KEY=/aman/backup-private.asc \
#     deploy/scripts/latihan-restore.sh [berkas.tar.gpg]
#
# Tanpa argumen: backup terbaru di BACKUP_DIR.
# Server bersih:
#   - bawaan: container PostgreSQL baru dari image yang sama dengan staging (butuh Docker),
#     dibuang setelah latihan;
#   - RESTORE_SERVER_URL=postgres://pengguna:sandi@host:5432/postgres: server lain yang sudah
#     ada; database sementara dibuat di sana lalu dihapus (butuh psql, pg_restore, gpg lokal).
# Hasil setiap latihan ditambahkan ke <BACKUP_DIR>/latihan-restore.log sebagai catatan.

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
script_dir=$(cd "$(dirname "$0")" && pwd)

: "${BACKUP_PRIVATE_KEY:?BACKUP_PRIVATE_KEY wajib diisi (berkas kunci privat GPG)}"
backup_file="${1:-}"
if [[ -z "$backup_file" ]]; then
  : "${BACKUP_DIR:?isi BACKUP_DIR atau sebutkan berkas backup}"
  backup_file=$(newest_backup "$BACKUP_DIR")
  [[ -n "$backup_file" ]] || die "tidak ada backup di $BACKUP_DIR"
fi
[[ -r "$backup_file" ]] || die "berkas backup tidak terbaca: $backup_file"
backup_file=$(cd "$(dirname "$backup_file")" && pwd)/$(basename "$backup_file")
key_file=$(cd "$(dirname "$BACKUP_PRIVATE_KEY")" && pwd)/$(basename "$BACKUP_PRIVATE_KEY")
log_file="$(dirname "$backup_file")/latihan-restore.log"
started=$(date +%s)

record() {
  local result="$1"
  printf '%s\t%s\t%s\t%s detik\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$result" "$(basename "$backup_file")" \
    "$(($(date +%s) - started))" >>"$log_file" 2>/dev/null || true
}

if [[ -n "${RESTORE_SERVER_URL:-}" ]]; then
  require_commands psql pg_restore gpg tar diff
  database="tyio_latihan_$(date -u +%Y%m%d%H%M%S)_$$"
  admin=("${PSQL_ARGS[@]}" "$RESTORE_SERVER_URL")
  log "Server bersih: database sementara $database di RESTORE_SERVER_URL"
  psql "${admin[@]}" -c "CREATE DATABASE $database" || die "database sementara gagal dibuat"
  trap 'psql "${admin[@]}" -c "DROP DATABASE IF EXISTS $database WITH (FORCE)" >/dev/null || true' EXIT
  # URL yang sama, dengan nama database diganti database sementara.
  [[ "$RESTORE_SERVER_URL" =~ ^(postgres(ql)?://[^/?]+)(/[^?]*)?(\?.*)?$ ]] ||
    die "RESTORE_SERVER_URL harus berbentuk postgres://pengguna:sandi@host:port/database"
  target_url="${BASH_REMATCH[1]}/$database${BASH_REMATCH[4]}"
  if "$script_dir/restore.sh" "$backup_file" "$target_url"; then
    record COCOK
    log "Latihan restore BERHASIL"
    exit 0
  fi
  record GAGAL
  die "latihan restore gagal"
fi

# Container PostgreSQL baru, image sama dengan staging (dibaca dari compose agar tidak menyimpang).
require_commands docker
compose_file="$script_dir/../compose.staging.yml"
image=$(grep -m1 -oE 'postgres:[^[:space:]]+@sha256:[0-9a-f]{64}' "$compose_file") ||
  die "image PostgreSQL tidak ditemukan di $compose_file"
container="tyio-latihan-restore-$$"
mounts=(-v "$script_dir:/scripts:ro" -v "$backup_file:/latihan/backup.tar.gpg:ro" -v "$key_file:/latihan/kunci.asc:ro")
passphrase_env=()
if [[ -n "${BACKUP_KEY_PASSPHRASE_FILE:-}" ]]; then
  passphrase_file=$(cd "$(dirname "$BACKUP_KEY_PASSPHRASE_FILE")" && pwd)/$(basename "$BACKUP_KEY_PASSPHRASE_FILE")
  mounts+=(-v "$passphrase_file:/latihan/passphrase:ro")
  passphrase_env=(-e BACKUP_KEY_PASSPHRASE_FILE=/latihan/passphrase)
fi

log "Server bersih: container baru $container dari $image"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=latihan \
  "${mounts[@]}" "$image" >/dev/null || die "container PostgreSQL gagal dijalankan"
for _ in $(seq 1 60); do
  # Init image menyalakan server sementara lalu me-restart-nya; tunggu sampai lewat tahap itu.
  # (Tanpa pipa ke grep -q: dengan pipefail, SIGPIPE ke docker logs membuat kondisi selalu salah.)
  if docker exec "$container" pg_isready -q -U postgres -d latihan 2>/dev/null &&
    [[ "$(docker logs "$container" 2>&1)" == *'PostgreSQL init process complete'* ]]; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready -q -U postgres -d latihan || die "PostgreSQL di container tidak siap"

if docker exec -e BACKUP_PRIVATE_KEY=/latihan/kunci.asc "${passphrase_env[@]}" "$container" \
  /scripts/restore.sh /latihan/backup.tar.gpg postgresql://postgres@localhost/latihan; then
  record COCOK
  log "Latihan restore BERHASIL"
  exit 0
fi
record GAGAL
die "latihan restore gagal"
