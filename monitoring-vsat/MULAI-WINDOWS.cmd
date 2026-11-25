@echo off
setlocal
cd /d "%~dp0"
echo Monitoring VSAT - Persiapan dan jalankan web lokal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum tersedia. Instal Node.js LTS lalu buka kembali file ini.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 goto gagal
)
call npm.cmd run setup
if errorlevel 1 goto gagal
echo.
echo Login dengan akun admin yang dibuat saat setup pertama.
echo Buka alamat Local yang muncul di bawah. Biarkan jendela ini terbuka.
call npm.cmd run dev
goto selesai
:gagal
echo.
echo Proses gagal. Salin pesan di atas untuk diperiksa.
pause
exit /b 1
:selesai
pause
