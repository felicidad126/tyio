@echo off
setlocal
cd /d "%~dp0"
echo NPR - Persiapan dan jalankan aplikasi dengan data demo
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum tersedia. Instal Node.js LTS versi 22 atau lebih baru, lalu buka kembali file ini.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Versi Node.js terlalu lama. Perlu versi 22.13 atau lebih baru. Instal Node.js LTS terbaru, lalu buka kembali file ini.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Memasang dependensi. Hanya saat pertama, butuh beberapa menit.
  call npm.cmd install
  if errorlevel 1 goto gagal
)

rem Aplikasi dibangun sekali. Untuk versi baru, ekstrak ZIP ke folder baru.
if not exist dist\server\main.js goto bangun
if not exist dist\client\index.html goto bangun
goto siapkan
:bangun
echo Menyiapkan aplikasi. Hanya saat pertama.
call npm.cmd run build
if errorlevel 1 goto gagal
call npm.cmd run build:server
if errorlevel 1 goto gagal

:siapkan
rem Database di folder data. Akun admin diminta saat pertama.
call npm.cmd run setup:server
if errorlevel 1 goto gagal
rem Data demo hanya diisi bila database masih kosong.
call npm.cmd run demo -- --jika-kosong
if errorlevel 1 goto gagal

echo.
echo Aplikasi berjalan di http://127.0.0.1:3000
echo Login dengan akun admin yang dibuat saat pertama kali.
echo Jika halaman belum tampil, tekan F5 di browser.
echo Biarkan jendela ini terbuka. Tutup jendela ini untuk menghentikan aplikasi.
echo.
start "" "http://127.0.0.1:3000"
call npm.cmd start
goto selesai

:gagal
echo.
echo Proses gagal. Salin pesan di atas untuk diperiksa.
pause
exit /b 1

:selesai
pause
