#!/usr/bin/env bash
# Uji asap produksi satu server (langkah 1.7, T155): dijalankan di server setelah memasang atau
# memperbarui, dan di CI. Memeriksa lewat Caddy di 127.0.0.1 dengan nama host asli (--resolve),
# jadi tidak bergantung DNS. Tidak mengubah data. Keluar 0 bila semua lulus.
#
#   deploy/scripts/uji-produksi.sh
#
# Dijalankan dari akar repo. NPR_ENV_FILE = berkas env (bawaan deploy/prod.env).
# Login, IP klien yang dicatat (T168), dan aliran pembaruan langsung ikut diperiksa bila
# UJI_EMAIL dan UJI_PASSWORD diisi
# (akun yang sudah ada; kata sandi lewat environment, bukan argumen):
#   read -rs UJI_PASSWORD && export UJI_PASSWORD UJI_EMAIL=admin@perusahaan.co.id
# UJI_CACERT = berkas root CA bila sertifikat dari CA kantor yang belum dipercaya server ini.

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_commands docker curl grep mktemp

env_file="${NPR_ENV_FILE:-deploy/prod.env}"
[[ -f "$env_file" ]] || die "berkas env tidak ada: $env_file (jalankan dari akar repo)"
compose=(docker compose --env-file "$env_file" -f deploy/compose.prod.yml)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

passed=0
failed=0
pass() {
  log "LULUS  $*"
  passed=$((passed + 1))
}
fail() {
  log "GAGAL  $*"
  failed=$((failed + 1))
}

# Port yang dibuka container di host; kosong bila tidak dibuka.
published() {
  local out
  out=$("${compose[@]}" port "$1" "$2" 2>/dev/null | head -1 || true)
  [[ -n "$out" && "${out##*:}" != 0 ]] && echo "${out##*:}"
  return 0
}

# 1. Semua service berjalan dan sehat (backup sehat = ada backup dalam 26 jam terakhir).
for service in db app caddy backup; do
  id=$("${compose[@]}" ps -q "$service" 2>/dev/null || true)
  status=$([[ -n "$id" ]] && docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo "tidak berjalan")
  if [[ "$status" == healthy ]]; then pass "service $service sehat"; else fail "service $service: $status"; fi
done

host=$("${compose[@]}" exec -T caddy printenv NPR_HOST 2>/dev/null) || die "container caddy tidak berjalan"
tls=$("${compose[@]}" exec -T caddy printenv NPR_TLS 2>/dev/null || true)
https_port=$(published caddy 443)
http_port=$(published caddy 80)
[[ -n "$https_port" && -n "$http_port" ]] || die "port HTTP/HTTPS caddy tidak dibuka di host"
base="https://$host"
[[ "$https_port" == 443 ]] || base="$base:$https_port"
curl_opts=(--silent --show-error --max-time 10
  --resolve "$host:$https_port:127.0.0.1" --resolve "$host:$http_port:127.0.0.1")
if [[ "$tls" == internal ]]; then
  "${compose[@]}" exec -T caddy cat /data/caddy/pki/authorities/local/root.crt >"$work/root.crt"
  curl_opts+=(--cacert "$work/root.crt")
elif [[ -n "${UJI_CACERT:-}" ]]; then
  curl_opts+=(--cacert "$UJI_CACERT")
fi
log "Memeriksa $base (TLS: ${tls:-?})"

# 2. HTTPS dengan sertifikat yang dipercaya, aplikasi dan database sehat.
body=$(curl "${curl_opts[@]}" "$base/api/health" 2>&1 || true)
if [[ "$body" == *'"status":"ok"'* && "$body" == *'"database":"ok"'* ]]; then
  pass "HTTPS dan /api/health"
else
  fail "HTTPS /api/health: $body"
fi

# 3. HTTP dialihkan ke HTTPS.
redirect=$(curl "${curl_opts[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "http://$host:$http_port/" || true)
if [[ "$redirect" =~ ^30[178]\ https:// ]]; then pass "HTTP dialihkan ke HTTPS"; else fail "HTTP tidak dialihkan: $redirect"; fi

# 4. Header keamanan dan kompresi halaman.
curl "${curl_opts[@]}" -D "$work/head" -o /dev/null -H 'Accept-Encoding: gzip' "$base/" || true
if grep -qi '^strict-transport-security:' "$work/head"; then pass "header HSTS"; else fail "header HSTS tidak ada"; fi
if grep -qi '^content-encoding: gzip' "$work/head"; then pass "halaman dikompresi"; else fail "halaman tidak dikompresi"; fi

# 5. Mode produksi (seed data dummy ditolak), database dan aplikasi tidak dibuka langsung ke host.
env_mode=$("${compose[@]}" exec -T app printenv NPR_ENV 2>/dev/null || true)
if [[ "$env_mode" == production ]]; then pass "NPR_ENV=production"; else fail "NPR_ENV=$env_mode"; fi
for target in "db 5432" "app 3000"; do
  # shellcheck disable=SC2086 # sengaja dipecah menjadi service dan port
  port=$(published $target)
  if [[ -z "$port" ]]; then pass "${target% *} tidak dibuka ke host"; else fail "${target% *} dibuka di port $port"; fi
done

# 6. Login, sesi, dan aliran pembaruan langsung (opsional, butuh akun).
if [[ -n "${UJI_EMAIL:-}" && -n "${UJI_PASSWORD:-}" ]]; then
  json_escape() {
    local text=${1//\\/\\\\}
    printf '%s' "${text//\"/\\\"}"
  }
  # IP contoh (TEST-NET-3) di X-Forwarded-For, seolah dikirim proxy di depan Caddy.
  forwarded_ip=203.0.113.9
  code=$(printf '{"email":"%s","password":"%s"}' "$(json_escape "$UJI_EMAIL")" "$(json_escape "$UJI_PASSWORD")" |
    curl "${curl_opts[@]}" -c "$work/jar" -D "$work/login" -o /dev/null -w '%{http_code}' \
      -H 'Content-Type: application/json' -H "X-Forwarded-For: $forwarded_ip" \
      --data-binary @- "$base/api/auth/login" || true)
  if [[ "$code" == 200 ]] && grep -qi '^set-cookie:.*secure' "$work/login" && grep -qi '^set-cookie:.*httponly' "$work/login"; then
    pass "login; cookie sesi Secure dan HttpOnly"
  else
    fail "login: HTTP $code"
  fi
  # IP yang dicatat audit untuk login tadi (dibaca langsung dari database, tanpa menulis).
  # Tanpa proxy di depan Caddy (TRUST_PROXY=1) IP kiriman klien tidak boleh dipercaya; di belakang
  # proxy (TRUST_PROXY=2, mis. nginx aaPanel) IP dari proxy itu harus sampai ke aplikasi.
  proxies=$("${compose[@]}" exec -T app printenv TRUST_PROXY 2>/dev/null || true)
  email_sql=${UJI_EMAIL//\'/\'\'}
  logged_ip=$("${compose[@]}" exec -T db psql -U npr -d npr -Atc \
    "SELECT coalesce(client_ip, '') FROM audit_log WHERE action = 'login' AND actor_label = '$email_sql' ORDER BY id DESC LIMIT 1" \
    2>/dev/null || true)
  if [[ "${proxies:-1}" == 1 && -n "$logged_ip" && "$logged_ip" != *"$forwarded_ip"* ]]; then
    pass "IP palsu dari klien tidak dipercaya (tercatat $logged_ip)"
  elif [[ "${proxies:-1}" != 1 && "$logged_ip" == *"$forwarded_ip"* ]]; then
    pass "IP klien dari proxy depan sampai ke aplikasi (TRUST_PROXY=$proxies)"
  else
    fail "IP klien di audit: '${logged_ip}' (TRUST_PROXY=${proxies:-?}, dikirim $forwarded_ip)"
  fi
  code=$(curl "${curl_opts[@]}" -b "$work/jar" -o /dev/null -w '%{http_code}' "$base/api/auth/me" || true)
  if [[ "$code" == 200 ]]; then pass "sesi terbaca (/api/auth/me)"; else fail "/api/auth/me: HTTP $code"; fi
  curl "${curl_opts[@]}" -b "$work/jar" -N --max-time 4 -D "$work/sse-head" -o "$work/sse" "$base/api/stream" 2>/dev/null || true
  if grep -q '^event: tersambung' "$work/sse" && ! grep -qi '^content-encoding:' "$work/sse-head"; then
    pass "aliran pembaruan langsung (SSE) tersambung tanpa kompresi"
  else
    fail "aliran pembaruan langsung tidak tersambung"
  fi
  curl "${curl_opts[@]}" -b "$work/jar" -o /dev/null -X POST "$base/api/auth/logout" || true
else
  log "Login dan aliran langsung tidak diperiksa (UJI_EMAIL/UJI_PASSWORD kosong)."
fi

log "Selesai: $passed lulus, $failed gagal"
((failed == 0))
