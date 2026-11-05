# Olikans V2 — Tahap 1: Master Produk

Versi ini adalah pengembangan dari V1.1. **Data transaksi, produksi, pengaturan, dan akuntansi lama tidak dihapus.**

## Yang sudah ditambahkan

- Fondasi database V2: `products`, `customers`, `orders`, `order_items`, `inventory_movements`.
- RLS Supabase untuk semua tabel baru.
- Menu **Produk** di aplikasi.
- Form tambah/edit produk: nama, SKU, kategori, berat, harga jual, HPP, stok awal, dan status.
- Stok awal produk dicatat ke `inventory_movements` sebagai `INITIAL`.
- `db.js` sekarang ikut mengambil master produk saat login.

## Urutan instalasi (WAJIB)

1. Backup repository/project lama. Disarankan buat branch `feature/olikans-v2`.
2. Buka Supabase > SQL Editor > New query.
3. Jalankan file `migrations/001_olikans_v2.sql`. Migration ini tidak memiliki `DROP TABLE` untuk tabel V1.1.
4. Setelah SQL sukses, ganti/upload file project dari paket V2 ini ke branch development.
5. Jalankan melalui Live Server di VS Code atau deploy preview Netlify.
6. Login dengan akun Supabase yang biasa digunakan.
7. Buka menu **Produk** dan buat satu produk percobaan, misalnya:
   - Nama: Kerupuk Tenggiri 250g
   - SKU: OLK-T250
   - Berat: 250 g
   - Harga jual: 14000
   - HPP: 8500
   - Stok awal: 100
8. Refresh halaman. Produk harus tetap muncul. Di Supabase Table Editor, cek tabel `products` dan `inventory_movements`.

## Jangan dilakukan dulu

- Jangan menghubungkan Shopee/Tokopedia sebelum modul order manual stabil.
- Jangan menghapus tabel `transaksi`, `produksi`, atau `pengaturan`.
- Jangan memakai `service_role` key di `config.js`.
- Jangan menjalankan eksperimen pada database produksi tanpa backup.

## Tahap berikutnya

Tahap 2 adalah modul **Pesanan Manual**: pilih sumber pesanan, pelanggan, beberapa produk, kuantitas, status pembayaran, status order, dan total. Setelah itu baru stok otomatis dan hubungan Order → Transaksi → Akuntansi.
