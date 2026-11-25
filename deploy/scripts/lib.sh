# shellcheck shell=bash
# Fungsi bersama skrip backup dan restore. Di-source, tidak dijalankan langsung.
#
# Koneksi database memakai variabel standar libpq (PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PGDATABASE). Alat yang dibutuhkan (psql, pg_dump, pg_restore, gpg, tar) sudah ada di image
# postgres:18 yang sama dengan database, jadi skrip ini bisa dijalankan di container itu.

set -Eeuo pipefail
umask 077

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "GAGAL: $*"
  exit 1
}

require_commands() {
  local missing=()
  for command in "$@"; do
    command -v "$command" >/dev/null 2>&1 || missing+=("$command")
  done
  ((${#missing[@]} == 0)) || die "perintah tidak ditemukan: ${missing[*]}"
}

# Sidik data per tabel: jumlah baris dan jumlah hash setiap baris. Tidak bergantung pada
# urutan baris dan memakai memori tetap, walau tabelnya besar. Setelan tampilan dipaku agar
# database yang isinya sama selalu menghasilkan teks yang sama, di sumber maupun hasil restore.
# Keluaran psql (-A -t -F TAB): tabel<TAB>jumlah baris<TAB>sidik.
manifest_sql() {
  cat <<'SQL'
SET TIME ZONE 'UTC';
SET datestyle = ISO;
SET intervalstyle = postgres;
SET bytea_output = hex;
SET extra_float_digits = 1;
SELECT format(
  'SELECT %L, count(*), coalesce(sum((''x'' || left(md5(t::text), 15))::bit(60)::bigint), 0) FROM %I.%I AS t',
  c.relname, n.nspname, c.relname)
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY c.relname
\gexec
SQL
}

# Menghentikan gpg-agent milik GNUPGHOME sementara, lalu menghapus foldernya.
stop_gpg() {
  if [[ -n "${GNUPGHOME:-}" && -d "$GNUPGHOME" ]]; then
    gpgconf --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf "$GNUPGHOME"
  fi
}

# Dipakai skrip yang men-source berkas ini.
# shellcheck disable=SC2034
PSQL_ARGS=(-X -q -A -t -F $'\t' -v ON_ERROR_STOP=1)

# Berkas backup terbaru di folder (nama npr-*.tar.gpg); kosong bila tidak ada.
newest_backup() {
  local dir="$1"
  find "$dir" -maxdepth 1 -type f -name 'npr-*.tar.gpg' -printf '%T@ %p\n' 2>/dev/null |
    sort -rn | head -n 1 | cut -d' ' -f2-
}
