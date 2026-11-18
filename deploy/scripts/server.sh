#!/usr/bin/env bash
# Menjalankan portal di server staging/demo dengan image yang sudah lolos CI.
# Panduan lengkap: docs/operasi/server-demo.md
#
#   deploy/scripts/server.sh pasang <domain-atau-ip> [--sertifikat-internal | --panel]
#       --panel: domain dan HTTPS diurus panel server (aaPanel/Nginx); aplikasi hanya di 127.0.0.1
#   deploy/scripts/server.sh perbarui      ke versi terbaru yang lolos semua uji CI
#   deploy/scripts/server.sh status        versi yang berjalan dan kesehatan
#   deploy/scripts/server.sh ulang-data    hapus semua data, isi ulang data contoh
#   deploy/scripts/server.sh sertifikat    CA sertifikat internal (mode IP/jaringan tertutup)
#   deploy/scripts/server.sh log [layanan] log berjalan (app, db, migrate, caddy)
#   deploy/scripts/server.sh telegram [hapus]  pasang (atau lepas) token bot Telegram untuk notifikasi
#
# Variabel lingkungan (opsional): TYIO_KANAL (bawaan "demo") memilih tag image yang diikuti.
#
# Seluruh isi skrip ada di dalam fungsi dan baru dijalankan di baris terakhir: `perbarui`
# memindahkan checkout ke commit image yang dipasang, termasuk berkas ini sendiri.
set -euo pipefail

ENV_FILE=deploy/staging.env
PROJECT=tyio-staging
REVISION_LABEL=org.opencontainers.image.revision

say() { printf '%s\n' "$*"; }
fail() { printf 'GAGAL: %s\n' "$*" >&2; exit 1; }

# Mode panel: Nginx milik panel server (mis. aaPanel) sudah memakai port 80/443 dan mengurus
# HTTPS, jadi Caddy tidak dijalankan.
compose() {
  local files=(-f deploy/compose.staging.yml)
  [ "$(env_get TYIO_TLS_MODE)" = panel ] || files+=(-f deploy/compose.https.yml)
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" "${files[@]}" "$@"
}

env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

env_set() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

need() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" > /dev/null || fail "perintah '$cmd' tidak ditemukan. Pasang dulu (lihat docs/operasi/server-demo.md)."
  done
  docker compose version > /dev/null 2>&1 || fail "Docker Compose v2 (docker compose) tidak ditemukan."
  docker info > /dev/null 2>&1 || fail "tidak bisa menghubungi Docker. Jalankan sebagai root atau anggota grup docker."
}

# Image di GHCR untuk repo ini: ghcr.io/<pemilik>/<repo>, huruf kecil.
default_image_repo() {
  local url path
  url="$(git remote get-url origin)"
  path="${url#*github.com[:/]}"
  path="${path%.git}"
  [ "$path" != "$url" ] || fail "remote origin bukan GitHub ($url). Isi TYIO_IMAGE_REPO di $ENV_FILE."
  printf 'ghcr.io/%s\n' "$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"
}

is_ip() { [[ "$1" =~ ^[0-9]+(\.[0-9]+){3}$ || "$1" == *:* ]]; }

# Menarik image kanal terbaru, mencatat digest-nya di env, dan mengembalikan revisinya.
pull_latest() {
  local repo channel ref digest revision
  repo="$(env_get TYIO_IMAGE_REPO)"
  channel="${TYIO_KANAL:-demo}"
  ref="$repo:$channel"
  say "Menarik $ref ..." >&2
  if ! docker pull --quiet "$ref" > /dev/null; then
    fail "image $ref tidak bisa ditarik. Bila paket GHCR masih privat, jadikan publik atau login:
  docker login ghcr.io -u <pengguna-github>   (token dengan izin read:packages)"
  fi
  digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$ref" | grep -m1 "^$repo@")" \
    || fail "digest $ref tidak ditemukan setelah ditarik."
  revision="$(docker image inspect --format "{{index .Config.Labels \"$REVISION_LABEL\"}}" "$ref")"
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || fail "image $ref tidak membawa label revisi commit ($REVISION_LABEL)."
  env_set TYIO_IMAGE "$digest"
  printf '%s\n' "$revision"
}

# Berkas compose dan skrip mengikuti commit yang sama dengan image yang dipasang.
checkout_revision() {
  local revision="$1"
  if [ "$(git rev-parse HEAD)" = "$revision" ]; then return; fi
  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "ada perubahan lokal di checkout ini ($(pwd)). Simpan atau buang dulu: git status"
  fi
  git cat-file -e "$revision^{commit}" 2> /dev/null || git fetch --quiet origin "$revision" \
    || fail "commit $revision tidak bisa diambil dari origin."
  git checkout --quiet --detach "$revision"
}

describe_revision() {
  git log -1 --date=format:'%Y-%m-%d %H:%M' --format='%h · %cd · %s' "$1" 2> /dev/null || printf '%s\n' "$1"
}

# Dibaca dari container aplikasi, bukan dari image: setelah tag pindah, image lama tidak lagi
# bisa dicari lewat digest-nya.
running_app() { compose ps -q app 2> /dev/null || true; }

running_revision() {
  local id
  id="$(running_app)"
  [ -z "$id" ] || docker inspect --format "{{index .Config.Labels \"$REVISION_LABEL\"}}" "$id" 2> /dev/null || true
}

running_image_id() {
  local id
  id="$(running_app)"
  [ -z "$id" ] || docker inspect --format '{{.Image}}' "$id" 2> /dev/null || true
}

start_stack() {
  # Alamat portal untuk tautan di pesan notifikasi; isian lama tanpa nilai ini dilengkapi.
  [ -n "$(env_get TYIO_PUBLIC_URL)" ] || env_set TYIO_PUBLIC_URL "https://$(env_get TYIO_DOMAIN)$(port_suffix)"
  say "Menjalankan migrasi dan aplikasi ..."
  if ! compose up -d --wait --remove-orphans; then
    compose ps -a >&2 || true
    compose logs --no-color --tail 40 >&2 || true
    if [ "$(env_get TYIO_TLS_MODE)" != panel ]; then
      say "Bila port 80/443 sudah dipakai web server lain (mis. Nginx aaPanel), pasang ulang dengan --panel." >&2
    fi
    fail "stack tidak sehat. Log di atas; detail: deploy/scripts/server.sh log"
  fi
}

port_in_use() { (exec 3<> "/dev/tcp/127.0.0.1/$1") 2> /dev/null; }

seed_demo() {
  say "Mengisi data contoh ..."
  # Database sudah berjalan dan termigrasi oleh start_stack.
  compose run --rm --no-deps -T -e TYIO_SEED_PASSWORD="$(env_get TYIO_SEED_PASSWORD)" app node dist/seed/run.js
}

ca_file() {
  local file
  file="$(mktemp)"
  compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$file" 2> /dev/null || true
  printf '%s\n' "$file"
}

port_suffix() {
  local port
  port="$(env_get TYIO_HTTPS_PORT)"
  if [ -n "$port" ] && [ "$port" != 443 ]; then printf ':%s' "$port"; fi
}

app_port() { env_get TYIO_APP_PORT | grep . || echo 8080; }

# Memeriksa portal lewat HTTPS dari server ini sendiri: tanpa bergantung pada DNS, dan tanpa
# proxy keluar yang mungkin terpasang di server (HTTPS_PROXY). Selain API, halaman dan berkas
# .js/.png juga harus sampai: konfigurasi bawaan panel bisa melayani berkas statis sendiri.
check_portal() {
  local domain mode base ca="" err index asset=""
  local curl_args=(-fsS --noproxy '*' --max-time 10)
  domain="$(env_get TYIO_DOMAIN)"
  mode="$(env_get TYIO_TLS_MODE)"
  base="https://$domain$(port_suffix)"
  if [ "$mode" = panel ]; then
    if curl "${curl_args[@]}" -o /dev/null "http://127.0.0.1:$(app_port)/api/health"; then
      say "Aplikasi: OK (http://127.0.0.1:$(app_port), hanya dari server ini)"
    else
      say "Aplikasi: TIDAK menjawab di http://127.0.0.1:$(app_port). Lihat: deploy/scripts/server.sh log app"
      return
    fi
  fi
  is_ip "$domain" || curl_args+=(--connect-to "::127.0.0.1:")
  if [ "$mode" = internal ]; then
    ca="$(ca_file)"
    curl_args+=(--cacert "$ca")
  fi
  if ! err="$(curl "${curl_args[@]}" --retry 5 --retry-delay 3 --retry-all-errors -o /dev/null "$base/api/health" 2>&1)"; then
    say "HTTPS: BELUM bisa diakses ($base): $(printf '%s' "$err" | tail -n 1)"
    case "$mode" in
      acme) say "  Pastikan domain mengarah ke server ini dan port 80/443 terbuka; lihat: deploy/scripts/server.sh log caddy" ;;
      panel) say "  Atur situs, SSL, dan reverse proxy di panel: docs/operasi/server-demo.md, bagian aaPanel." ;;
    esac
  else
    index="$(curl "${curl_args[@]}" "$base/" 2> /dev/null || true)"
    [[ "$index" =~ (/assets/[^\"]+\.js) ]] && asset="${BASH_REMATCH[1]}"
    if [ -n "$asset" ] && curl "${curl_args[@]}" -o /dev/null "$base$asset" 2> /dev/null \
      && curl "${curl_args[@]}" -o /dev/null "$base/pwa-192.png" 2> /dev/null; then
      say "HTTPS: OK ($base)"
    else
      say "HTTPS: API menjawab, tetapi halaman atau berkas aplikasi (.js/.png) tidak sampai ($base)."
      [ "$mode" != panel ] || say "  Konfigurasi situs di panel melayani berkas statis sendiri: pakai 'location ^~ /' (docs/operasi/server-demo.md, bagian aaPanel)."
    fi
  fi
  [ -z "$ca" ] || rm -f "$ca"
}

print_accounts() {
  local domain
  domain="$(env_get TYIO_DOMAIN)"
  say ""
  say "Portal: https://$domain$(port_suffix)"
  say "Akun contoh (kata sandi sama untuk semua): $(env_get TYIO_SEED_PASSWORD)"
  say "  helpdesk.contoh  Helpdesk, semua customer"
  say "  helpdesk.merapi  Helpdesk, hanya Bank Merapi Sejahtera"
  say "  admin.contoh     Admin (pengelola aplikasi), semua customer"
  say "Kata sandi tersimpan di $ENV_FILE (hanya bisa dibaca root/pemilik)."
}

cmd_pasang() {
  local domain="${1:-}" mode=acme revision
  [ -n "$domain" ] || fail "sebutkan domain atau alamat IP portal: deploy/scripts/server.sh pasang noc-demo.contoh.co.id"
  [[ "$domain" =~ ^[A-Za-z0-9.:-]+$ ]] || fail "domain '$domain' tidak sah (tanpa https:// dan tanpa garis miring)."
  shift
  case "${1:-}" in
    --panel) mode=panel ;;
    --sertifikat-internal) mode=internal ;;
    '') is_ip "$domain" && mode=internal ;;
    *) fail "pilihan '$1' tidak dikenal. Pilihan: --panel atau --sertifikat-internal" ;;
  esac
  need docker git openssl curl
  if [ ! -e "$ENV_FILE" ] && [ "$mode" != panel ] && { port_in_use 80 || port_in_use 443; }; then
    fail "port 80/443 di server ini sudah dipakai (mis. Nginx milik aaPanel). Biarkan panel yang mengurus domain dan HTTPS:
  deploy/scripts/server.sh pasang $domain --panel"
  fi
  if [ -e "$ENV_FILE" ]; then
    # Mengulang pasang yang terhenti (mis. image belum bisa ditarik): konfigurasi lama dipakai.
    [ "$(env_get TYIO_DOMAIN)" = "$domain" ] \
      || fail "$ENV_FILE sudah ada untuk domain $(env_get TYIO_DOMAIN). Pakai 'perbarui', atau hapus berkas itu untuk mulai dari awal."
    say "Memakai konfigurasi yang sudah ada: $ENV_FILE"
  else
    (
      umask 077
      {
        printf '# Dibuat oleh deploy/scripts/server.sh pasang pada %s. Jangan masuk git.\n' "$(date -u +%Y-%m-%dT%H:%MZ)"
        printf 'TYIO_DOMAIN=%s\n' "$domain"
        printf 'TYIO_TLS_MODE=%s\n' "$mode"
        printf 'TYIO_IMAGE_REPO=%s\n' "${TYIO_IMAGE_REPO:-$(default_image_repo)}"
        printf 'TYIO_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)"
        printf 'TYIO_SEED_PASSWORD=Demo-%s\n' "$(openssl rand -hex 6)"
        if [ "$mode" = panel ]; then
          # Nginx panel satu-satunya proxy di depan aplikasi.
          printf 'TYIO_TRUST_PROXY_HOPS=1\n'
          printf 'TYIO_APP_PORT=%s\n' "${TYIO_APP_PORT:-8080}"
        fi
      } > "$ENV_FILE"
    )
    say "Konfigurasi dibuat: $ENV_FILE (domain $domain, sertifikat $mode)."
  fi
  mode="$(env_get TYIO_TLS_MODE)"
  revision="$(pull_latest)"
  checkout_revision "$revision"
  start_stack
  seed_demo
  check_portal
  say "Versi berjalan: $(describe_revision "$revision")"
  print_accounts
  if [ "$mode" = internal ]; then
    say ""
    say "Sertifikat internal: browser memperingatkan sampai CA-nya dipasang di komputer penonton."
    say "  deploy/scripts/server.sh sertifikat > tyio-ca.crt"
  elif [ "$mode" = panel ]; then
    say ""
    say "Berikutnya di aaPanel: buat situs $domain, pasang SSL, dan reverse proxy ke"
    say "http://127.0.0.1:$(app_port) (docs/operasi/server-demo.md, bagian aaPanel)."
    say "Lalu periksa: deploy/scripts/server.sh status"
  fi
}

cmd_perbarui() {
  local before before_image revision
  need docker git curl
  [ -e "$ENV_FILE" ] || fail "server belum dipasang. Jalankan dulu: deploy/scripts/server.sh pasang <domain>"
  before="$(running_revision)"
  before_image="$(running_image_id)"
  revision="$(pull_latest)"
  checkout_revision "$revision"
  # Sisa langkah memakai skrip dari commit yang baru dipasang, bukan salinan lama yang sedang
  # berjalan: berkas compose dan cara menjalankannya bisa berubah bersama versi baru.
  exec bash deploy/scripts/server.sh _perbarui-lanjut "$revision" "$before" "$before_image"
}

cmd_perbarui_lanjut() {
  local revision="$1" before="${2:-}" before_image="${3:-}"
  if [ -n "$before" ] && [ "$revision" = "$before" ]; then
    # Tetap pastikan semua layanan berjalan (tanpa start ulang yang tidak berubah).
    compose up -d --wait --remove-orphans > /dev/null 2>&1 || start_stack
    say "Sudah versi terbaru: $(describe_revision "$revision")"
    return
  fi
  start_stack
  # Image versi lama (±400 MB) tidak dipakai lagi; gagal dihapus bukan masalah.
  if [ -n "$before_image" ] && [ "$before_image" != "$(running_image_id)" ]; then
    docker image rm "$before_image" > /dev/null 2>&1 || true
  fi
  check_portal
  [ -z "$before" ] || say "Sebelumnya: $(describe_revision "$before")"
  say "Versi berjalan: $(describe_revision "$revision")"
}

# Token bot ditanyakan tanpa tampil, diperiksa dengan satu panggilan getMe ke Telegram dari server
# ini (bukti token berlaku dan Telegram terjangkau), baru disimpan. Token tidak pernah muncul di
# baris perintah, daftar proses, atau keluaran.
cmd_telegram() {
  local token me username
  need docker curl
  [ -e "$ENV_FILE" ] || fail "server belum dipasang."
  if [ "${1:-}" = hapus ]; then
    env_set TYIO_TELEGRAM_BOT_TOKEN ''
    compose up -d --wait app > /dev/null
    say "Token bot dilepas: notifikasi dicatat tetapi tidak dikirim."
    return
  fi
  [ -z "${1:-}" ] || fail "pilihan '$1' tidak dikenal. Pakai: telegram, atau telegram hapus"
  printf 'Token bot dari @BotFather (tidak ditampilkan): ' >&2
  IFS= read -rs token
  printf '\n' >&2
  [[ "$token" =~ ^[0-9]{5,12}:[A-Za-z0-9_-]{30,64}$ ]] || fail "bentuk token tidak sah. Salin utuh dari @BotFather (angka:kode)."
  if ! me="$(printf 'url = "https://api.telegram.org/bot%s/getMe"\n' "$token" | curl -sS --max-time 15 -K -)"; then
    fail "Telegram tidak bisa dihubungi dari server ini (periksa akses internet keluar ke api.telegram.org)."
  fi
  case "$me" in
    *'"ok":true'*) ;;
    *'"error_code":401'* | *'"error_code":404'*) fail "Telegram menolak token ini. Salin ulang dari @BotFather (/mybots → API Token)." ;;
    *) fail "jawaban Telegram tidak terduga; token tidak disimpan." ;;
  esac
  username="$(printf '%s' "$me" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
  env_set TYIO_TELEGRAM_BOT_TOKEN "$token"
  say "Menjalankan ulang aplikasi dengan token baru ..."
  compose up -d --wait app > /dev/null || fail "aplikasi tidak sehat setelah token dipasang. Lihat: deploy/scripts/server.sh log app"
  say "Bot @$username terpasang."
  say "Berikutnya: tambahkan @$username ke grup Telegram, lalu di portal buka Admin › Notifikasi → Tambah grup → Cari grup."
}

cmd_status() {
  local revision
  [ -e "$ENV_FILE" ] || fail "server belum dipasang."
  compose ps
  revision="$(running_revision)"
  say ""
  say "Versi berjalan: $(describe_revision "${revision:-tidak diketahui}")"
  check_portal
}

cmd_ulang_data() {
  local answer
  [ -e "$ENV_FILE" ] || fail "server belum dipasang."
  if [ "${1:-}" != --ya ]; then
    say "Semua data di portal ini (tiket, remote, lampiran, audit) akan DIHAPUS lalu diisi data contoh."
    read -r -p "Ketik HAPUS untuk melanjutkan: " answer
    [ "$answer" = HAPUS ] || fail "dibatalkan."
  fi
  # Hanya database dan lampiran; volume sertifikat Caddy (bila ada) tetap.
  compose rm --stop --force app migrate db
  docker volume rm "${PROJECT}_db-data" "${PROJECT}_attachments"
  start_stack
  seed_demo
  print_accounts
}

cmd_sertifikat() {
  local ca
  [ -e "$ENV_FILE" ] || fail "server belum dipasang."
  case "$(env_get TYIO_TLS_MODE)" in
    internal) ;;
    panel) fail "sertifikat diurus panel server (aaPanel), bukan oleh skrip ini." ;;
    *) fail "server ini memakai sertifikat publik; tidak ada CA untuk dipasang." ;;
  esac
  ca="$(ca_file)"
  [ -s "$ca" ] || { rm -f "$ca"; fail "CA belum dibuat. Pastikan Caddy berjalan (deploy/scripts/server.sh status)."; }
  cat "$ca"
  rm -f "$ca"
}

main() {
  cd "$(dirname "$0")/../.."
  local command="${1:-}"
  [ $# -eq 0 ] || shift
  case "$command" in
    pasang) cmd_pasang "$@" ;;
    perbarui) cmd_perbarui ;;
    _perbarui-lanjut) cmd_perbarui_lanjut "$@" ;;
    status) cmd_status ;;
    ulang-data) cmd_ulang_data "$@" ;;
    sertifikat) cmd_sertifikat ;;
    telegram) cmd_telegram "$@" ;;
    log) [ -e "$ENV_FILE" ] || fail "server belum dipasang."; compose logs --tail 200 -f "$@" ;;
    *) sed -n '2,14p' deploy/scripts/server.sh | sed 's/^# \{0,1\}//'; [ -z "$command" ] || exit 2 ;;
  esac
}

main "$@"
exit
