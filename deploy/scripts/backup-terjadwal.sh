#!/usr/bin/env bash
# Penjadwal backup untuk service `backup` di compose: berjalan terus, membuat satu backup
# setiap hari pada BACKUP_TIME_UTC (bawaan 18:30 UTC = 01:30 WIB). Saat mulai, langsung
# membuat backup bila belum ada backup dalam 24 jam terakhir (mis. pemasangan pertama).
#
# Backup yang gagal dicatat di log container dan dicoba lagi di jadwal berikutnya; status
# kesehatan container menjadi "unhealthy" bila backup terbaru lebih tua dari batasnya
# (backup-sehat.sh), sehingga terlihat di `docker compose ps`.

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
script_dir=$(cd "$(dirname "$0")" && pwd)

: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"
BACKUP_TIME_UTC="${BACKUP_TIME_UTC:-18:30}"
[[ "$BACKUP_TIME_UTC" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BACKUP_TIME_UTC harus HH:MM (UTC)"

trap 'log "Penjadwal backup berhenti"; exit 0' TERM INT

run_backup() {
  "$script_dir/backup.sh" >/dev/null || log "Backup gagal; dicoba lagi pada jadwal berikutnya"
}

seconds_until_next_run() {
  local now next
  now=$(date -u +%s)
  next=$(date -u -d "today $BACKUP_TIME_UTC" +%s)
  ((next > now)) || next=$(date -u -d "tomorrow $BACKUP_TIME_UTC" +%s)
  echo $((next - now))
}

log "Penjadwal backup aktif: setiap hari $BACKUP_TIME_UTC UTC ke $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
if [[ -z "$(find "$BACKUP_DIR" -maxdepth 1 -name 'tyio-*.tar.gpg' -mmin -1440 -print -quit)" ]]; then
  log "Belum ada backup dalam 24 jam terakhir; membuat backup sekarang"
  run_backup
fi

while true; do
  wait_seconds=$(seconds_until_next_run)
  log "Backup berikutnya dalam $((wait_seconds / 3600)) jam $((wait_seconds % 3600 / 60)) menit"
  # sleep di latar agar sinyal berhenti dari Docker langsung ditangani.
  sleep "$wait_seconds" &
  wait $!
  run_backup
done
