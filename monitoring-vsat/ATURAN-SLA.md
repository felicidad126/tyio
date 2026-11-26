# Aturan simulasi SLA

Ini aturan untuk demonstrasi tugas Kerja Praktek, bukan kontrak SLA resmi PT. Tangara Mitrakom. Target perbandingan disetel 99,5% pada backend.

- Periode adalah bulan kalender WIB (UTC+7). Bulan lampau memakai seluruh bulan; bulan berjalan hanya sampai saat laporan diminta. Bulan depan menghasilkan total 0 dan persentase kosong, bukan dianggap 100%.
- Rumus: `(total menit periode - downtime tanggung jawab TM) / total menit periode × 100`.
- Hanya NPR yang mempunyai TT berinstruksi Maintenance masuk perhitungan. NPR tanpa TT dan TT Preventive Maintenance tidak dihitung downtime TM.
- TT Maintenance mengonfirmasi gangguan jaringan. Awal waktu yang dihitung adalah waktu awal gangguan NPR, bukan waktu administrasi pembuatan TT. Catatan Create NPR sendiri diabaikan dalam perubahan tanggung jawab awal. Segmen awal dianggap TM setelah ada konfirmasi TT Maintenance; setiap tindakan Problem dan tindakan berikutnya memakai Pending By yang dipilih. Segmen Pending Customer dikecualikan, segmen TM dihitung. Eskalasi Service otomatis mengubah tanggung jawab menjadi TM.
- Tutup NPR dengan waktu Kembali Online yang sebenarnya. Downtime berhenti pada waktu ini, bukan waktu pengisian report atau klik Close. NPR aktif dihitung sampai sekarang. Tindakan harus berurutan waktunya dan tidak boleh di masa depan.
- TT Gamas selalu merupakan gangguan jaringan massal: seluruh site terpilih dihitung dari awal gangguan sampai waktu online atau sekarang. Gamas tidak memiliki pause Pending Customer dalam versi ini.
- Semua interval dibatasi ke periode laporan. Interval gangguan yang bertumpang tindih, baik antar-NPR maupun dengan Gamas, digabung per remote sehingga tidak ada perhitungan ganda.
- Riwayat yang sudah Close tidak dapat diperbarui. TT hanya satu per NPR. Report teknisi harus tercatat sebelum NPR dengan TT ditutup. Gamas juga membutuhkan report sebelum Close.
- Total waktu didasarkan layanan 24 jam sehari, bukan hanya jam kerja helpdesk. Versi ini belum mempunyai jam layanan kontrak per customer, hari libur, penalti, atau toleransi maintenance terjadwal.

## Contoh verifikasi

Gangguan Maintenance mulai 02.00, eskalasi 03.00 dan kembali online 06.00: downtime 4 jam jika tidak ada segmen Pending Customer. Jika report baru dicatat 07.00, waktu administrasi tambahan tidak mengubah downtime. Gamas 04.00–08.00 pada site sama membuat gabungan gangguan 02.00–08.00 = 6 jam, bukan 8 jam hasil penjumlahan mentah.

## Waktu dan data

API menyimpan tanggal dalam ISO UTC. Form HTML datetime-local ditafsirkan secara eksplisit sebagai WIB (UTC+7); tampilan waktu juga memakai WIB. Semua nama customer, PIC, lokasi dan IP dalam seed adalah data dummy. IP menggunakan blok dokumentasi 192.0.2.0/24, 198.51.100.0/24 dan 203.0.113.0/24.
