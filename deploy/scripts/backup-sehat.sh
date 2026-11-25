#!/usr/bin/env bash
# Healthcheck service `backup`: sehat bila ada backup yang lebih muda dari
# BACKUP_MAX_AGE_HOURS (bawaan 26 jam: jadwal harian ditambah kelonggaran).

set -euo pipefail
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"
max_hours="${BACKUP_MAX_AGE_HOURS:-26}"
recent=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'npr-*.tar.gpg' -mmin "-$((max_hours * 60))" -print -quit)
if [[ -z "$recent" ]]; then
  echo "Tidak ada backup dalam $max_hours jam terakhir di $BACKUP_DIR" >&2
  exit 1
fi
echo "Backup terbaru: $recent"
