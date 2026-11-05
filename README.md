# Kas Kerupuk Olikans — Upgrade Akuntansi v1.1

Proyek tetap memakai **HTML + CSS + JavaScript + Supabase** (tanpa build/npm). Dapat diedit melalui **VS Code**, disimpan ke GitHub, dan di-deploy di Netlify.

## Isi penambahan

- `accounting.js` (BARU) — mesin jurnal otomatis berbasis transaksi, buku besar per akun, neraca saldo, laba rugi **indikatif**, arus kas, dan generator ekspor 5 lembar `.xlsx`.
- `accounting-ui.js` (BARU) — menu Akuntansi dengan tab Jurnal, Buku Besar, Neraca Saldo, Laba Rugi, dan Arus Kas serta pemilih bulan.
- `index.html` (DIUBAH) — navigasi Akuntansi, form penerimaan Penjualan/Modal/Pinjaman/Pendapatan Lain, grafik **selisih kas bukan laba**, tanggal pelunasan piutang tidak mengubah tanggal penjualan, penanganan error simpan.
- `db.js` (DIUBAH) — penyimpanan `paid_at`, pagination fetch (agar tidak berhenti di 1.000 transaksi), propagasi beberapa error Supabase, dan pembersihan data lokal saat keluar.
- `schema.sql` (DITAMBAH) — `ALTER TABLE transaksi ADD COLUMN paid_at date` yang idempoten; tetap mengaktifkan RLS. **Tidak menghapus data**.
- `manifest.json` (BARU) — identitas aplikasi PWA.
- `sw.js` (DIUBAH) — inisialisasi service worker; **belum melakukan cache offline**, sehingga perlu koneksi untuk skrip Supabase dan Excel dari CDN.
- `tests/accounting.test.js` (BARU) — pengujian logika laporan menggunakan Node.js tanpa npm.

## Langkah pemasangan — urutan penting

1. **Cadangkan** folder proyek asli, database Supabase, dan bila perlu ekspor transaksi sebelum memulai. Hindari tombol **Isi data contoh** dan **Kosongkan semua data** pada database produksi.
2. Masuk **Supabase > SQL Editor > New query** dan jalankan isi `schema.sql` dari paket ini. Jika `transaksi`, `produksi`, dan `pengaturan` sudah ada, skrip mempertahankan isinya. Untuk instalasi lama dengan RLS buatan sendiri, periksa kebijakan RLS terlebih dahulu karena skrip mengganti policy bernama sama.
3. Di VS Code, buka **folder yang langsung berisi `index.html`**. Salin file baru dan file yang diubah dari paket ini ke folder tersebut. **Jangan hapus `config.js` milikmu**; paket masih membawa konfigurasi aslinya.
4. Buka menggunakan ekstensi **Live Server** di VS Code (atau hosting web lokal) untuk tes. Jangan mengandalkan membuka `file://` secara langsung.
5. Login ke akun Supabase yang benar (jika menggunakan mode cloud) dan coba transaksi contoh kecil: modal Rp1.000.000; penjualan tunai Rp100.000; beban listrik Rp20.000. Buka menu Akuntansi, bulan berjalan. Total debit/kredit harus seimbang, arus kas akhir Rp1.080.000, hasil laba indikatif Rp80.000.
6. Uji kredit/piutang: catat penjualan **Belum bayar**, lihat Jurnal (Piutang / Penjualan), kemudian klik **Lunas** dari Beranda. Tanggal penjualan tidak berubah; pelunasan diakui sebagai penerimaan kas pada tanggal pelunasan.
7. Klik **Ekspor 5 laporan ke Excel** pada menu Akuntansi. File `Laporan-Olikans-YYYY-MM.xlsx` berisi Jurnal Umum, Buku Besar, Neraca Saldo, Laba Rugi, dan Arus Kas. Fitur ekspor memakai SheetJS yang dimuat melalui CDN saat tersambung internet.
8. Setelah tes, lakukan `git add .`, `git commit -m "Tambah modul akuntansi otomatis"`, `git push origin main`. Jika Netlify tersambung ke repository/branch tersebut, deployment akan mengikuti konfigurasi Netlify yang aktif. Pastikan **publish directory** dan pengaturan rute (contohnya `/kas/` jika ada) tetap sesuai konfigurasi situsmu.

## Aturan jurnal yang digunakan

| Transaksi | Debit | Kredit |
|---|---|---|
| Penjualan tunai | 101 Kas | 401 Penjualan |
| Penjualan belum dibayar | 102 Piutang Usaha | 401 Penjualan |
| Pelunasan piutang | 101 Kas | 102 Piutang Usaha |
| Setoran modal pemilik | 101 Kas | 301 Modal Pemilik |
| Pinjaman diterima | 101 Kas | 201 Utang Pinjaman |
| Pendapatan lain tunai | 101 Kas | 402 Pendapatan Lain |
| Pengeluaran tunai | Beban 501–506 (menurut kategori) | 101 Kas |

Neraca saldo bersifat **kumulatif hingga akhir bulan** yang dipilih. Laporan laba rugi dan arus kas memuat transaksi **dalam bulan** yang dipilih. Tidak ada jurnal penyesuaian, jurnal penutup, ataupun tahun buku tersendiri pada versi ini.

## Batasan yang wajib dipahami sebelum dipakai untuk laporan resmi

1. **Tidak menghitung HPP produksi dan mutasi persediaan aktual.** Semua pengeluaran bahan baku dan kemasan saat ini didebit sebagai beban ketika dibayar. Ini merupakan penyederhanaan; laba rugi bersifat **indikatif, bukan laba bersih final**. Form Produksi hanya mencatat massa bahan dan estimasi biaya; belum memposting transaksi akuntansi.
2. Belum ada penjualan per SKU, pembelian stok kredit, utang usaha dagang, retur, diskon, PPN, aset tetap, penyusutan, atau aktivitas investasi. Arus kas investasi selalu 0 sampai kategori dan jurnalnya dibuat. Penjualan tidak otomatis mengurangi barang jadi dan membuat jurnal HPP.
3. Jurnal dibuat **dinamis dari baris `transaksi` di browser**, bukan disimpan sebagai tabel `journal_entries/journal_lines` di database. Versi ini berguna untuk tahap prototipe usaha kecil, **belum menyediakan jurnal permanen, tutup buku, audit trail, penguncian periode, ataupun transaksi database yang atomik**.
4. `paid_at` lama belum tersedia. Transaksi historis dengan `paid=true` tetapi `paid_at=NULL` diasumsikan lunas pada **tanggal transaksinya**. Jika versi lama sudah mengganti tanggal penjualan ketika tombol Lunas ditekan, tanggal asli **tidak dapat direkonstruksi** tanpa bukti atau backup.
5. Jika histori sistem dimulai di tengah jalannya usaha, kas awal dan ekuitas belum tentu benar sampai transaksi/saldo pembuka direkonsiliasi. Jangan mengarang setoran modal untuk menyamakan neraca.
6. Ketika masuk Supabase, data lokal tidak otomatis digabungkan ke data cloud. **Sebelum beralih akun/perangkat, backup dan pastikan transaksi tersimpan di Supabase**. Saat Supabase sedang bermasalah, aplikasi tidak mengklaim penyimpanan cloud berhasil.
7. PWA belum memiliki mode offline penuh. File `config.js` memuat kunci **publishable** Supabase (bukan `service_role`); keamanan bergantung pada pengaturan RLS, autentikasi, dan kebijakan akses yang benar.

## Pengujian logika otomatis

Dengan Node.js versi modern, jalankan dari root proyek:

```bash
node tests/accounting.test.js
```

Pengujian mencakup keseimbangan debit-kredit, kas akhir, laba indikatif, penjualan kredit dan pelunasan beda bulan, pinjaman, sanitasi HTML, serta keberadaan lima worksheet Excel lewat *mock* SheetJS. Pengujian ini **bukan pengujian end-to-end browser/Supabase**. Sebelum deploy ke situs aktif, uji manual semua form terhadap proyek Supabase-mu.

## Tahap berikutnya untuk laporan yang benar-benar lengkap

Tambahkan master barang/SKU, bahan baku, hasil produksi, nilai persediaan, pembebanan HPP saat penjualan, utang usaha, jurnal penyesuaian/penutup, ledger permanen di database, pengunci periode, dan audit trail. Baru setelah itu neraca posisi keuangan dan laba bersih final dapat disusun secara lebih andal.
