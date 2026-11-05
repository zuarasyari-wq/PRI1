# Olikans V2 - Update Lengkap

Update ini dapat dipasang ke folder V2 Tahap 1 yang sudah dipakai. Tidak perlu membuat project/folder baru.

## File yang diganti
- `index.html`
- `db.js`

## File SQL baru
- `migrations/002_order_workflow.sql`

Jalankan **hanya** `002_order_workflow.sql` di Supabase SQL Editor karena migration 001 sudah pernah dijalankan.

## Fitur
- Pesanan manual / WhatsApp / Shopee / Tokopedia / TikTok Shop / Website.
- Detail item dan total otomatis saat disimpan.
- Status order: Baru -> Dikonfirmasi -> Diproses -> Siap dikirim -> Dikirim -> Selesai.
- Saat Selesai: stok produk berkurang, riwayat inventory tercatat, dan transaksi penjualan dibuat untuk modul akuntansi.
- Produksi dapat diarahkan ke satu produk sehingga hasil kg dikonversi menjadi pcs berdasarkan berat produk dan masuk stok.
- Navbar: Beranda, Pesanan, Produk, Produksi, Lainnya.
- Menu Lainnya menampung Keuangan, Akuntansi, dan Akun.

## Penting
Backup folder sebelum overwrite. Jangan ganti `config.js`; gunakan config yang sudah berhasil login ke Supabase.
