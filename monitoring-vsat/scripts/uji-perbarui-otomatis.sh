#!/usr/bin/env bash
# Uji logika perbarui-otomatis.sh dengan repo git sungguhan (origin bare dan
# clone "server") serta docker dan curl tiruan. Dijalankan CI (workflow NPR).
#   bash scripts/uji-perbarui-otomatis.sh
#
# Kondisi tiap pemeriksaan ditulis dalam kutip tunggal dan baru dievaluasi di
# cek(), jadi variabel di dalamnya sengaja tidak diperluas lebih awal.
# shellcheck disable=SC2016,SC2034
set -u
SKRIP="$(cd "$(dirname "$0")" && pwd)/perbarui-otomatis.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/state"
LULUS=0; GAGAL=0
cek() { if eval "$2"; then echo "LULUS  $1"; LULUS=$((LULUS+1)); else echo "GAGAL  $1"; GAGAL=$((GAGAL+1)); echo "----- log:"; tail -5 "$T/log"; fi; }

# docker tiruan: build mencatat versi yang "berjalan"; versi di rusak.txt tidak sehat.
cat > "$T/bin/docker" <<'D'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE/panggilan.txt"
if [ "$*" = "compose up -d --build" ]; then echo "$NPR_VERSI" > "$FAKE/jalan.txt"; exit 0; fi
if [[ "$*" == *cadangan.js* ]]; then [ -e "$FAKE/cadangan-gagal" ] && exit 1; echo "Cadangan dibuat"; exit 0; fi
exit 0
D
# curl tiruan: check-runs dari ci.json, health dari jalan.txt.
cat > "$T/bin/curl" <<'C'
#!/usr/bin/env bash
url="${*: -1}"
case "$url" in
  *check-runs*) echo "$url" >> "$FAKE/url-ci.txt"; [ -e "$FAKE/ci-gagal-baca" ] && exit 22; cat "$FAKE/ci.json" ;;
  *health*) v=$(cat "$FAKE/jalan.txt" 2>/dev/null); grep -qx "$v" "$FAKE/rusak.txt" 2>/dev/null && exit 7; printf '{"ok":true,"versi":"%s"}' "$v" ;;
esac
C
chmod +x "$T/bin/docker" "$T/bin/curl"
ci() { # status conclusion  → JSON mirip GitHub (berformat rapi)
  if [ "$1" = kosong ]; then printf '{\n  "total_count": 0,\n  "check_runs": [\n\n  ]\n}\n' > "$T/ci.json"; return; fi
  cat > "$T/ci.json" <<J
{
  "total_count": 1,
  "check_runs": [
    {
      "id": 1,
      "name": "Periksa NPR",
      "head_sha": "abc",
      "status": "$1",
      "conclusion": $([ "$2" = null ] && echo null || echo "\"$2\""),
      "output": { "title": null, "summary": null },
      "app": { "id": 15368, "slug": "github-actions", "owner": { "login": "github", "type": "Organization" } }
    }
  ]
}
J
}
# Repo: origin (bare) dan clone "server".
git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/kerja" 2>/dev/null
cd "$T/kerja" && git checkout -q -b Rev-NPR-Tyio && mkdir -p monitoring-vsat/migrations review && echo a > monitoring-vsat/app.txt && echo d > review/doc.md && git add -A && git -c user.name=u -c user.email=u@x commit -qm awal && git push -q origin Rev-NPR-Tyio 2>/dev/null
git clone -q -b Rev-NPR-Tyio "$T/origin.git" "$T/server"
komit() { (cd "$T/kerja" && eval "$1" && git add -A && git -c user.name=u -c user.email=u@x commit -qm "$2" && git push -q -f origin Rev-NPR-Tyio); }
jalan() { FAKE="$T" PATH="$T/bin:$PATH" REPO_DIR="$T/server" STATE_DIR="$T/state" LOG="$T/log" GITHUB_API=http://github.tiruan HEALTH_URL=http://health.tiruan/api/health TUNGGU_SEHAT=3 JEDA_CEK=1 bash "$SKRIP" "$@"; }
head_server() { git -C "$T/server" rev-parse --short=7 HEAD; }
: > "$T/log"

# 1. Tidak ada commit baru
out=$(jalan --coba); cek "1. Tanpa commit baru: sudah terbaru" '[[ "$out" == *"Sudah terbaru"* ]]'
jalan >/dev/null; cek "1b. Waktu cek terakhir tercatat, log tetap kosong" '[ -s "$T/state/cek-terakhir" ] && [ ! -s "$T/log" ]'
# 2. Commit kode baru, CI belum ada; dijalankan dua kali hanya tercatat sekali
komit 'echo b > monitoring-vsat/app.txt' "Ubah aplikasi"; ci kosong
awal=$(head_server); jalan >/dev/null; jalan >/dev/null
cek "2. CI belum ada: menunggu, tercatat sekali, belum dipasang" '[ "$(grep -c "Menunggu CI" "$T/log")" = 1 ] && [ "$(head_server)" = "$awal" ]'
cek "2b. Nama cek dikirim ter-encode" 'grep -q "check_name=Periksa%20NPR" "$T/url-ci.txt"'
# 3. CI berjalan
ci in_progress null; jalan >/dev/null
out=$(jalan --coba)
cek "3. CI berjalan: tetap menunggu tanpa baris log baru" '[[ "$out" == *"(berjalan)"* ]] && [ "$(grep -c "Menunggu CI" "$T/log")" = 1 ] && [ "$(head_server)" = "$awal" ]'
# 4. CI gagal
ci completed failure; jalan >/dev/null
cek "4. CI gagal: tidak dipasang" 'grep -q "tidak lulus (failure)" "$T/log" && [ "$(head_server)" = "$awal" ]'
# 13. Cadangan gagal
ci completed success; touch "$T/cadangan-gagal"; jalan >/dev/null
cek "13. Cadangan gagal: tidak di-merge" 'grep -q "Cadangan database gagal" "$T/log" && [ "$(head_server)" = "$awal" ]'
rm "$T/cadangan-gagal"
# 5. CI lulus: pasang
jalan >/dev/null; baru=$(git -C "$T/kerja" rev-parse --short=7 HEAD)
cek "5. CI lulus: cadangan, merge, build, sehat dengan versi baru" '[ "$(head_server)" = "$baru" ] && grep -q "Berhasil: $baru" "$T/log" && [ "$(cat "$T/jalan.txt")" = "$baru" ] && grep -q cadangan.js "$T/panggilan.txt"'
# 6. Hanya dokumen
: > "$T/panggilan.txt"; komit 'echo d2 > review/doc.md' "Ubah dokumen"; jalan >/dev/null
cek "6. Hanya dokumen: di-pull tanpa build" '[ "$(head_server)" = "$(git -C "$T/kerja" rev-parse --short=7 HEAD)" ] && [ ! -s "$T/panggilan.txt" ] && grep -q "tanpa build" "$T/log"'
# 7. Migrasi
sebelum=$(head_server); komit 'echo "ALTER" > monitoring-vsat/migrations/0003.sql' "Tambah migrasi"; jalan >/dev/null
cek "7. Migrasi: menunggu agent, tidak dipasang" 'grep -q "perubahan besar" "$T/log" && [ "$(head_server)" = "$sebelum" ]'
# 8. [manual] di pesan commit (setelah agent memasang migrasi secara manual)
git -C "$T/server" pull -q --ff-only; komit 'echo c > monitoring-vsat/app.txt' "Ubah aplikasi [manual]"; sebelum=$(head_server); jalan >/dev/null
cek "8. Tanda [manual]: menunggu agent" '[ "$(grep -c "perubahan besar" "$T/log")" = 2 ] && [ "$(head_server)" = "$sebelum" ]'
git -C "$T/server" pull -q --ff-only
# 9. Build rusak: kembali, tidak dicoba lagi, lalu commit perbaikan terpasang
komit 'echo rusak > monitoring-vsat/app.txt' "Versi rusak"; rusak=$(git -C "$T/kerja" rev-parse --short=7 HEAD); echo "$rusak" > "$T/rusak.txt"
sebelum=$(head_server); jalan >/dev/null
cek "9. Tidak sehat: kembali ke commit lama dan sehat" '[ "$(head_server)" = "$sebelum" ] && grep -q "Gagal: $rusak" "$T/log" && grep -q "Kembali ke $sebelum: sehat" "$T/log" && [ "$(cat "$T/jalan.txt")" = "$sebelum" ]'
: > "$T/panggilan.txt"; jalan >/dev/null
cek "9b. Commit gagal tidak dicoba lagi" '[ ! -s "$T/panggilan.txt" ] && grep -q "pernah gagal" "$T/log"'
komit 'echo baik > monitoring-vsat/app.txt' "Perbaikan"; jalan >/dev/null
cek "9c. Commit perbaikan berikutnya terpasang" '[ "$(head_server)" = "$(git -C "$T/kerja" rev-parse --short=7 HEAD)" ]'
# 10. Jeda
komit 'echo e > monitoring-vsat/app.txt' "Ubah lagi"; touch "$T/state/jeda"; sebelum=$(head_server); jalan >/dev/null
cek "10. Jeda: tidak ada yang dipasang" '[ "$(head_server)" = "$sebelum" ]'
rm "$T/state/jeda"
# 11. Ubahan lokal di server
echo lokal >> "$T/server/monitoring-vsat/app.txt"; jalan >/dev/null
cek "11. Ubahan lokal: perlu manual" 'grep -q "diubah langsung di server" "$T/log" && [ "$(head_server)" = "$sebelum" ]'
git -C "$T/server" checkout -q -- monitoring-vsat/app.txt
# 14. Hasil CI tak terbaca
touch "$T/ci-gagal-baca"; jalan >/dev/null
cek "14. GitHub tak terbaca: dicoba lagi nanti" 'grep -q "tidak bisa dibaca" "$T/log" && [ "$(head_server)" = "$sebelum" ]'
rm "$T/ci-gagal-baca"
# 12. Riwayat ditulis ulang (force-push)
(cd "$T/kerja" && git reset -q --hard HEAD~2 && echo f > monitoring-vsat/app.txt && git add -A && git -c user.name=u -c user.email=u@x commit -qm "Riwayat lain" && git push -q -f origin Rev-NPR-Tyio)
jalan >/dev/null
cek "12. Bukan kelanjutan: perlu manual" 'grep -q "bukan kelanjutan" "$T/log" && [ "$(head_server)" = "$sebelum" ]'
# Mode coba tidak mengubah apa pun
git -C "$T/server" reset -q --hard "$(git -C "$T/kerja" rev-parse HEAD~1)" 2>/dev/null; sebelum=$(head_server); : > "$T/panggilan.txt"
out=$(jalan --coba)
cek "15. --coba: hanya menampilkan keputusan" '[[ "$out" == *"Akan dipasang"* ]] && [ "$(head_server)" = "$sebelum" ] && [ ! -s "$T/panggilan.txt" ]'
echo; echo "$LULUS lulus, $GAGAL gagal"
[ "$GAGAL" = 0 ] || { echo "----- isi log lengkap:"; cat "$T/log"; exit 1; }
