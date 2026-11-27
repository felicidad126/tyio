#!/usr/bin/env bash
# Pembaruan otomatis NPR di server sendiri. Dijalankan cron setiap 5 menit:
#
#   */5 * * * * /opt/monitoring-vsat/monitoring-vsat/scripts/perbarui-otomatis.sh
#
#   perbarui-otomatis.sh          periksa dan pasang bila ada commit baru
#   perbarui-otomatis.sh --coba   hanya tampilkan keputusan, tanpa mengubah apa pun
#
# Urutan:
#  1. Ambil commit terbaru branch Rev-NPR-Tyio dari GitHub.
#  2. Lanjut hanya bila job "Periksa NPR" (workflow .github/workflows/npr.yml)
#     untuk commit itu lulus. Repo publik, jadi hasilnya dibaca tanpa token.
#  3. Perubahan besar tidak dipasang otomatis dan menunggu agent browser:
#     migrations/, schema.sql, Dockerfile, docker-compose.yml, atau pesan
#     commit yang berisi [manual].
#  4. Commit yang hanya mengubah berkas di luar monitoring-vsat/ (dokumen)
#     cukup di-pull tanpa build ulang.
#  5. Selain itu: cadangan database, git merge --ff-only, build ulang, lalu
#     /api/health harus sehat dan menunjukkan commit baru.
#  6. Bila gagal: kembali ke commit sebelumnya dan build ulang. Commit yang
#     gagal tidak dicoba lagi sampai ada commit yang lebih baru.
#
# Jeda sementara (mis. saat agent mengerjakan perubahan besar):
#   touch /var/lib/npr-perbarui/jeda    lalu hapus berkas itu untuk lanjut.
# Catatan kejadian: /var/log/npr-perbarui.log
# Waktu cek terakhir (tanda cron berjalan): /var/lib/npr-perbarui/cek-terakhir

set -euo pipefail
# Cron hanya memberi PATH minimal; folder standar ditambahkan di belakang.
export PATH="${PATH:-}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO_DIR="${REPO_DIR:-/opt/monitoring-vsat}"
APP_DIR="$REPO_DIR/monitoring-vsat"
BRANCH="${BRANCH:-Rev-NPR-Tyio}"
GITHUB_REPO="${GITHUB_REPO:-felicidad126/tyio}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"
NAMA_CEK="${NAMA_CEK:-Periksa NPR}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
STATE_DIR="${STATE_DIR:-/var/lib/npr-perbarui}"
LOG="${LOG:-/var/log/npr-perbarui.log}"
TUNGGU_SEHAT="${TUNGGU_SEHAT:-180}" # detik
JEDA_CEK="${JEDA_CEK:-5}"           # detik
POLA_BESAR='^monitoring-vsat/(migrations/|schema\.sql$|Dockerfile$|docker-compose\.yml$)'

COBA=0
[ "${1:-}" = "--coba" ] && COBA=1

catat() {
  local baris
  baris="$(TZ=Asia/Jakarta date '+%Y-%m-%d %H:%M:%S') $*"
  echo "$baris"
  [ "$COBA" = 1 ] || echo "$baris" >>"$LOG"
}

# Mencatat keadaan yang bisa berulang tiap 5 menit (menunggu CI, perlu
# manual) hanya sekali per commit dan keadaan.
lapor() {
  local kunci="${1:0:7} $2"
  if [ "$COBA" = 1 ] || [ "$(cat "$STATE_DIR/terakhir" 2>/dev/null)" != "$kunci" ]; then
    catat "$3"
    [ "$COBA" = 1 ] || echo "$kunci" >"$STATE_DIR/terakhir"
  fi
}

# Keadaan job CI untuk satu commit: belum-ada, berjalan, success, failure, ...
hasil_ci() {
  local json total status hasil
  json="$(curl -fsS --max-time 20 -H "Accept: application/vnd.github+json" \
    "$GITHUB_API/repos/$GITHUB_REPO/commits/$1/check-runs?check_name=${NAMA_CEK// /%20}")" ||
    { echo "tidak-terbaca"; return; }
  total="$(grep -o '"total_count": *[0-9]*' <<<"$json" | grep -o '[0-9]*$' || true)"
  if [ "${total:-0}" = 0 ]; then echo "belum-ada"; return; fi
  status="$(grep -o '"status": *"[a-z_]*"' <<<"$json" | head -1 | grep -o '"[a-z_]*"$' | tr -d '"' || true)"
  if [ "$status" != "completed" ]; then echo "berjalan"; return; fi
  hasil="$(grep -o '"conclusion": *"[a-z_]*"' <<<"$json" | head -1 | grep -o '"[a-z_]*"$' | tr -d '"' || true)"
  echo "${hasil:-tidak-diketahui}"
}

# Build ulang dengan commit yang sedang di-checkout, lalu tunggu sampai
# container sehat dan /api/health menunjukkan commit itu.
bangun_dan_cek() {
  local versi batas jawab
  versi="$(git -C "$REPO_DIR" rev-parse --short=7 HEAD)"
  (cd "$APP_DIR" && NPR_VERSI="$versi" docker compose up -d --build) >>"$LOG" 2>&1 || return 1
  batas=$((SECONDS + TUNGGU_SEHAT))
  while [ "$SECONDS" -lt "$batas" ]; do
    sleep "$JEDA_CEK"
    jawab="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
    if grep -q '"ok":true' <<<"$jawab" && grep -q "\"versi\":\"$versi\"" <<<"$jawab"; then
      return 0
    fi
  done
  return 1
}

utama() {
  mkdir -p "$STATE_DIR"
  [ -e "$STATE_DIR/jeda" ] && { [ "$COBA" = 1 ] && echo "Dijeda: $STATE_DIR/jeda ada."; return 0; }
  exec 9>"$STATE_DIR/kunci"
  flock -n 9 || return 0 # pembaruan sebelumnya masih berjalan
  # Tanda cron masih berjalan, walau tidak ada commit baru yang dicatat.
  [ "$COBA" = 1 ] || TZ=Asia/Jakarta date '+%Y-%m-%d %H:%M:%S' >"$STATE_DIR/cek-terakhir"

  cd "$REPO_DIR"
  if ! git fetch --quiet origin "$BRANCH" 2>>"$LOG"; then
    lapor "fetch00" fetch-gagal "Gagal mengambil commit dari GitHub. Dicoba lagi nanti."
    return 0
  fi
  local sekarang baru pendek berkas
  sekarang="$(git rev-parse HEAD)"
  baru="$(git rev-parse FETCH_HEAD)"
  pendek="${baru:0:7}"
  if [ "$sekarang" = "$baru" ]; then
    [ "$COBA" = 1 ] && echo "Sudah terbaru: ${sekarang:0:7}."
    return 0
  fi
  if grep -qx "$baru" "$STATE_DIR/gagal" 2>/dev/null; then
    lapor "$baru" gagal-lama "Commit $pendek pernah gagal dipasang. Menunggu commit yang lebih baru."
    return 0
  fi
  if ! git merge-base --is-ancestor "$sekarang" "$baru"; then
    lapor "$baru" bukan-lanjutan "Commit $pendek bukan kelanjutan ${sekarang:0:7}. Perlu pembaruan manual."
    return 0
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    lapor "$baru" ada-ubahan "Ada berkas yang diubah langsung di server. Perlu pembaruan manual."
    return 0
  fi

  local ci
  ci="$(hasil_ci "$baru")"
  case "$ci" in
    success) ;;
    belum-ada | berjalan)
      lapor "$baru" ci-tunggu "Menunggu CI untuk $pendek ($ci)."
      return 0 ;;
    tidak-terbaca)
      lapor "$baru" ci-tak-terbaca "Hasil CI untuk $pendek tidak bisa dibaca dari GitHub. Dicoba lagi nanti."
      return 0 ;;
    *)
      lapor "$baru" ci-gagal "CI untuk $pendek tidak lulus ($ci). Tidak dipasang."
      return 0 ;;
  esac

  berkas="$(git diff --name-only "$sekarang" "$baru")"
  # Tanpa pipa ke grep -q: dengan pipefail, SIGPIPE pada git log bisa
  # membuat tanda [manual] terlewat.
  if grep -Eq "$POLA_BESAR" <<<"$berkas" ||
    grep -qF '[manual]' <<<"$(git log --format=%B "$sekarang..$baru")"; then
    lapor "$baru" manual "Commit $pendek berisi perubahan besar (migrasi, Dockerfile, compose, atau [manual]). Perlu pembaruan lewat agent browser."
    return 0
  fi

  if ! grep -q '^monitoring-vsat/' <<<"$berkas"; then
    if [ "$COBA" = 1 ]; then
      echo "Akan di-pull tanpa build (hanya berkas di luar monitoring-vsat/): ${sekarang:0:7} -> $pendek."
      return 0
    fi
    git merge --ff-only --quiet "$baru"
    catat "Terpasang $pendek tanpa build (hanya dokumen)."
    return 0
  fi

  if [ "$COBA" = 1 ]; then
    echo "Akan dipasang: ${sekarang:0:7} -> $pendek ($(git log -1 --format=%s "$baru"))."
    return 0
  fi

  catat "Memasang ${sekarang:0:7} -> $pendek: $(git log -1 --format=%s "$baru")"
  if ! (cd "$APP_DIR" && docker compose exec -T app node dist/server/cadangan.js) >>"$LOG" 2>&1; then
    lapor "$baru" cadangan-gagal "Cadangan database gagal. $pendek tidak dipasang."
    return 1
  fi
  git merge --ff-only --quiet "$baru"
  if bangun_dan_cek; then
    catat "Berhasil: $pendek terpasang dan sehat."
    return 0
  fi

  catat "Gagal: $pendek tidak sehat. Kembali ke ${sekarang:0:7}."
  echo "$baru" >>"$STATE_DIR/gagal"
  git reset --keep --quiet "$sekarang"
  if bangun_dan_cek; then
    catat "Kembali ke ${sekarang:0:7}: sehat."
  else
    catat "Kembali ke ${sekarang:0:7} juga tidak sehat. Perlu dicek manual."
  fi
  return 1
}

utama "$@"
exit $?
