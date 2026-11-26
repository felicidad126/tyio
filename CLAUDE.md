# CLAUDE.md

Sebelum bekerja, baca `review/HANDOVER-SESI.md`: konteks proyek NPR, keputusan, peta kode, cara
uji, dan keadaan server.

Aturan singkat (rincian di dokumen itu):

- **Branch:**
  - Kerjakan dan push hanya ke `Rev-NPR-Tyio`.
  - Jangan merge atau membuat pull request ke `main`.
  - Jangan mengubah branch lain.
- **Data rahasia:** repo ini publik. Jangan menulis password, cookie, nama asli, atau ID
  database asli.
- **Bahasa:** balasan, label, komentar kode, dan pesan commit memakai Bahasa Indonesia.
- **Kode aplikasi** ada di `monitoring-vsat/`. Folder `apps/`, `packages/`, `deploy/` milik
  proyek lama.
- **Pemeriksaan setelah perubahan:**
  - `tsc -b`, lint, Prettier, build, build:server, `test:api` (51/51), uji browser (53/53).
  - Uji browser di lebar laptop dan HP.
  - Setelah push, pastikan job "Periksa NPR" (workflow NPR di GitHub Actions) lulus. Server
    hanya memasang commit yang lulus.
  - Laporkan hasilnya apa adanya.
- **Server:**
  - Jangan menyentuh container atau situs lain.
  - Jangan menjalankan `docker compose down -v`.
  - Jangan menghapus volume.
