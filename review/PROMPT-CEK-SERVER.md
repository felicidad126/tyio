# Prompt cek spesifikasi server untuk agent browser

Salin teks di dalam kotak ke agent browser yang sedang membuka akses remote server Anda (web terminal, panel hosting, atau konsol VNC/RDP di browser).

```text
Tugasmu: mencatat spesifikasi server yang sedang terbuka di browser ini.
Server ini akan dipakai untuk menjalankan aplikasi web kecil (React +
Node.js + database SQLite) bernama NPR. Hasilmu dipakai untuk memutuskan
cara memasang aplikasi itu.

ATURAN PENTING
- HANYA MEMBACA. Jangan memasang, menghapus, mengubah, memulai ulang,
  atau menghentikan apa pun. Jangan menjalankan perintah dengan sudo
  kecuali perintah itu hanya membaca dan memang diminta di bawah.
- Jangan menyalin password, token, kunci SSH, isi berkas .env, atau data
  rahasia lain ke laporan. Jika sebuah perintah menampilkan hal seperti
  itu, tulis "[disembunyikan]".
- Jika sebuah perintah tidak ada atau ditolak, catat pesannya apa adanya
  lalu lanjutkan.
- Jika server diakses lewat panel (cPanel, aaPanel, Plesk, Cockpit,
  Proxmox, dsb.) dan tidak ada terminal, ambil informasi yang sama dari
  menu panel dan sebutkan nama panelnya.

LANGKAH 1. Kenali cara akses
Catat: apa yang terbuka di browser (web terminal, panel apa, konsol
VNC/RDP), dan alamatnya tanpa password atau token.

LANGKAH 2. Jika servernya Linux, jalankan perintah ini satu per satu
dan salin keluarannya:

  cat /etc/os-release
  uname -a
  nproc
  free -h
  df -h /
  whoami
  id
  sudo -n true 2>&1 && echo "sudo tanpa password: ya" || echo "sudo tanpa password: tidak"
  node -v
  npm -v
  which pm2 docker nginx apache2 httpd caddy sqlite3 git
  docker --version
  systemctl --version | head -1
  systemctl is-active nginx apache2 httpd caddy docker 2>/dev/null
  ss -tlnp 2>/dev/null || netstat -tlnp
  curl -sI https://registry.npmjs.org | head -1
  curl -s https://ifconfig.me ; echo
  ls /etc/nginx/sites-enabled 2>/dev/null
  ls /etc/letsencrypt/live 2>/dev/null
  sudo -n ufw status 2>/dev/null || sudo -n firewall-cmd --list-all 2>/dev/null
  timedatectl 2>/dev/null | grep -i "time zone"

LANGKAH 3. Jika servernya Windows, jalankan di PowerShell:

  Get-ComputerInfo | Select-Object OsName, OsVersion, CsProcessors, CsTotalPhysicalMemory
  Get-PSDrive C
  whoami
  node -v
  npm -v
  Get-Command docker, nginx, pm2, git -ErrorAction SilentlyContinue
  Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess | Sort-Object LocalPort
  Get-Service W3SVC -ErrorAction SilentlyContinue
  (Invoke-WebRequest -UseBasicParsing -Method Head https://registry.npmjs.org).StatusCode
  Get-TimeZone

LANGKAH 4. Pertanyaan yang dijawab dari hasil di atas
1. Sistem operasi dan versinya.
2. Jumlah CPU, total RAM, dan sisa ruang disk.
3. Apakah kamu login sebagai root/administrator, atau punya sudo?
4. Apakah Node.js dan npm sudah ada? Versi berapa?
5. Apakah Docker sudah ada dan berjalan?
6. Web server apa yang sudah berjalan (Nginx, Apache, IIS, Caddy, tidak
   ada)? Situs apa saja yang sudah dikonfigurasi (nama berkasnya saja)?
7. Port apa saja yang sedang dipakai? Apakah port 80, 443, 3000, dan
   8787 kosong?
8. Apakah server bisa mengakses internet (registry.npmjs.org)?
9. IP publik server, dan apakah ada sertifikat HTTPS (Let's Encrypt)?
10. Firewall: aktif atau tidak, port apa yang dibuka.
11. Zona waktu server.
12. Apakah ada aplikasi lain yang sedang berjalan yang sebaiknya tidak
    diganggu?

LAPORAN
Tulis dalam format ini:

  CARA AKSES: ...
  OS: ...
  CPU / RAM / DISK SISA: ...
  USER DAN HAK AKSES: ...
  NODE.JS / NPM: ...
  DOCKER: ...
  WEB SERVER DAN SITUS YANG ADA: ...
  PORT TERPAKAI: ...
  PORT 80 / 443 / 3000 / 8787: kosong atau terpakai (oleh apa)
  AKSES INTERNET: ...
  IP PUBLIK / HTTPS: ...
  FIREWALL: ...
  ZONA WAKTU: ...
  APLIKASI LAIN YANG BERJALAN: ...
  PERINTAH YANG GAGAL ATAU DITOLAK: ...
  CATATAN LAIN: ...

Lampirkan juga keluaran mentah semua perintah (dengan data rahasia
disembunyikan) di bawah laporan.
```
