/* ============================================================
   OLIKANS - LAPISAN DATA SUPABASE
   Versi 2.2 - Alur Bisnis Disederhanakan

   ALUR UTAMA:
   1. PRODUKSI
      Produksi -> stok bertambah

   2. PESANAN
      Pesanan dibuat -> stok diperiksa
      Pesanan selesai -> stok berkurang + transaksi penjualan

   3. PENYESUAIAN STOK
      Hanya untuk koreksi stok fisik

   4. KEUANGAN
      Transaksi non-penjualan dicatat dari index.html

   CATATAN:
   - Nama fungsi lama dipertahankan agar tetap kompatibel
     dengan index.html.
   - Skema database tidak diubah dari db.js.
   ============================================================ */

const DB = (() => {

  let c = null;
  let user = null;
  let tm = null;
  let role = null;   /* 'owner' | 'customer' | null (belum diketahui) */

  const state = { sync: 'idle', error: '', at: null };

  const DEV = new URLSearchParams(location.search).has('dev');

  const ST_OK = ['NEW', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'];

  /* ============================================================
     HELPER
     ============================================================ */

  const strip = o => {
    if (!o) return o;
    const { user_id, ...r } = o;
    return r;
  };

  const fail = e => {
    throw new Error((e && e.message) || String(e));
  };

  const need = () => {
    if (!c) fail('Supabase belum terhubung');
    if (!user) fail('Silakan login terlebih dahulu');
  };

  const setSync = (s, e) => {
    state.sync = s;
    state.error = e || '';
    if (s === 'ok') state.at = new Date();
    if (api.hooks.sync) api.hooks.sync(state);
  };

  /*
    Ambil seluruh data per 500 baris.
    Urutan kedua menggunakan id supaya pagination
    tidak menghasilkan baris yang tumpang tindih.
  */
  async function all(table, order, asc) {
    const rows = [];
    for (;;) {
      let q = c.from(table).select('*').range(rows.length, rows.length + 499);
      if (order && order !== 'id') {
        q = q.order(order, { ascending: asc });
      }
      q = q.order('id', { ascending: true });

      const { data, error } = await q;
      if (error) fail(error);

      const r = data || [];
      rows.push(...r);
      if (r.length < 500) return rows;
    }
  }

  /* ============================================================
     API
     ============================================================ */

  const api = {

    /* ---------------------- HOOK ---------------------- */

    hooks: { sync: null, auth: null },

    get on() { return !!c; },
    get user() { return user; },
    get ready() { return !!(c && user); },
    get needLogin() { return !!c && !user; },
    get sync() { return state; },
    get dev() { return DEV; },

    /*
      Untuk sekarang seluruh akun dianggap sebagai owner.
      Nantinya bisa dikembangkan untuk:
      owner, admin, kasir, produksi
    */
    /*
      Peran dibaca dari tabel profiles (migration 003).
      Jika belum terbaca (mis. migration belum dijalankan), tetap 'owner'
      supaya perilaku V2 lama tidak berubah.
    */
    get role() { return role || 'owner'; },

    get isCustomer() { return !!user && role === 'customer'; },

    can(aksi) {
      if (role !== 'customer') return true;
      return ['shop', 'cart', 'myorders', 'akun'].includes(aksi);
    },

    /* ==========================================================
       BOOT
       ========================================================== */

    async boot() {
      const k = window.KAS_CONFIG || {};

      if (!k.url || !k.anonKey || !window.supabase) {
        console.warn('Supabase belum dikonfigurasi.');
        return null;
      }

      c = window.supabase.createClient(k.url, k.anonKey);

      c.auth.onAuthStateChange((evt, session) => {
        user = session?.user || null;
        if (!user) role = null;
        if (evt === 'SIGNED_OUT' && api.hooks.auth) {
          setTimeout(api.hooks.auth, 0);
        }
      });

      const { data, error } = await c.auth.getSession();
      if (error) console.warn('Gagal membaca session:', error.message);

      user = data?.session?.user || null;

      if (user) await api.loadRole();

      return user ? api.pull() : null;
    },

    /* ==========================================================
       PERAN PENGGUNA (profiles.role)
       ========================================================== */

    async loadRole() {
      role = null;
      if (!c || !user) return role;

      try {
        const { data, error } = await c
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data && (data.role === 'owner' || data.role === 'customer')) {
          role = data.role;
        }
      } catch (_) { /* biarkan null -> dianggap owner */ }

      return role;
    },

    /* ==========================================================
       PULL SEMUA DATA
       ========================================================== */

    async pull() {
      if (!c || !user) return null;

      setSync('syncing');

      try {
        /* Pembeli hanya perlu pesanannya sendiri (dibatasi RLS buyer_id). */
        if (role === 'customer') {
          const [myOrders, myItems] = await Promise.all([
            all('orders', 'created_at', false),
            all('order_items', 'created_at', true)
          ]);

          setSync('ok');

          return {
            ...EMPTY_S(),
            orders: myOrders.map(strip),
            orderItems: myItems.map(strip)
          };
        }

        const [tx, batch, p, products, customers, orders, items, moves] =
          await Promise.all([
            all('transaksi', 'date', true),
            all('produksi', 'date', true),
            c.from('pengaturan').select('cfg').maybeSingle(),
            all('products', 'name', true),
            all('customers', 'name', true),
            all('orders', 'created_at', false),
            all('order_items', 'created_at', true),
            all('inventory_movements', 'created_at', false)
          ]);

        if (p.error) fail(p.error);

        const base = typeof S !== 'undefined' ? (S.cfg || {}) : {};

        setSync('ok');

        return {
          tx: tx.map(strip),
          batch: batch.map(strip),
          products: products.map(strip),
          customers: customers.map(strip),
          orders: orders.map(strip),
          orderItems: items.map(strip),
          inventory: moves.map(strip),
          cfg: { ...base, ...(p.data?.cfg || {}) }
        };

      } catch (err) {
        console.warn('Supabase:', err.message);
        setSync('error', err.message);
        return null;
      }
    },

    /* ==========================================================
       LOGIN / LOGOUT
       ========================================================== */

    async auth(email, password, daftar) {
      if (!c) return 'Supabase belum terhubung.';

      if (daftar) {
        return 'Pendaftaran dinonaktifkan. Minta pemilik usaha membuatkan akun.';
      }

      if (!email || !password) return 'Isi email dan kata sandi.';

      const r = await c.auth.signInWithPassword({ email, password });
      if (r.error) return r.error.message;

      user = r.data?.session?.user || null;

      if (user) await api.loadRole();

      return user ? '' : 'Gagal masuk. Coba lagi.';
    },

    async logout() {
      if (c) await c.auth.signOut();
      user = null;

      /* Hapus cache lokal supaya data akun sebelumnya
         tidak tetap terlihat setelah logout. */
      localStorage.removeItem('kas-umkm-v1');
      role = null;
    },

    /* ==========================================================
       TOKO ONLINE (PEMBELI)
       ========================================================== */

    /* Daftar sebagai pembeli. Peran 'customer' diberikan otomatis oleh trigger. */
    async register(name, email, password) {
      if (!c) return { error: 'Supabase belum terhubung.' };
      if (!name || !email || !password) return { error: 'Isi nama, email, dan kata sandi.' };
      if (password.length < 6) return { error: 'Kata sandi minimal 6 karakter.' };

      const r = await c.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });

      if (r.error) return { error: r.error.message };

      const sess = r.data?.session;

      if (sess) {
        user = sess.user;
        await api.loadRole();
        return { ok: true };
      }

      /* Supabase meminta konfirmasi email dulu. */
      return { ok: true, confirm: true };
    },

    /* Katalog untuk pembeli (tanpa HPP) dari get_catalog(). */
    async catalog() {
      need();

      const { data, error } = await c.rpc('get_catalog');
      if (error) fail(error);

      return (data || []).map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        weight_grams: Number(p.weight_grams) || 0,
        selling_price: Number(p.selling_price) || 0,
        stock: Number(p.stock) || 0
      }));
    },

    /*
      Checkout pembeli -> place_order().
      Harga dan stok dibaca ulang oleh database, bukan dari browser.
      items: [{ product_id, quantity }]
    */
    async placeOrder(items, buyer) {
      need();

      if (!Array.isArray(items) || !items.length) fail('Keranjang masih kosong');

      const payload = items.map(i => ({
        product_id: i.product_id,
        quantity: Math.floor(Number(i.quantity))
      }));

      if (payload.some(i => !i.product_id || !(i.quantity >= 1))) {
        fail('Jumlah produk tidak valid');
      }

      const { data, error } = await c.rpc('place_order', {
        p_items: payload,
        p_name: String(buyer?.name || '').trim(),
        p_phone: String(buyer?.phone || '').trim() || null,
        p_address: String(buyer?.address || '').trim() || null,
        p_notes: String(buyer?.notes || '').trim() || null
      });

      if (error) fail(error);

      return data;
    },

    /* ==========================================================
       TRANSAKSI KEUANGAN
       ========================================================== */

    /*
      addTx() digunakan untuk transaksi keuangan manual:
      - Pengeluaran
      - Modal masuk
      - Pinjaman diterima
      - Pendapatan lainnya

      PENJUALAN PRODUK tidak seharusnya dibuat dari sini.
      Penjualan dibuat otomatis oleh complete_order_safe
      ketika pesanan diselesaikan.

      Mode lokal: jika Supabase tidak dikonfigurasi, fungsi dilewati.
    */
    async addTx(x) {
      if (!c) return;

      need();

      if (!x) fail('Data transaksi tidak valid');

      const amount = Number(x.amt);

      if (!Number.isFinite(amount) || amount <= 0) {
        fail('Nominal transaksi harus lebih dari 0');
      }

      if (x.type !== 'in' && x.type !== 'out') {
        fail('Jenis transaksi tidak valid');
      }

      /* Cegah penjualan produk dibuat secara manual. */
      const cat = String(x.cat || '').trim().toLowerCase();

      if (x.type === 'in' && cat === 'penjualan') {
        fail(
          'Penjualan produk harus dicatat melalui Pesanan. ' +
          'Pendapatan akan dibuat otomatis ketika pesanan diselesaikan.'
        );
      }

      const { error } = await c.from('transaksi').insert(x);
      if (error) fail(error);
    },

    async updTx(x) {
      if (!c) return;

      need();

      if (!x || !x.id) fail('Transaksi tidak valid');

      const { data, error } = await c
        .from('transaksi')
        .update({ paid: x.paid, paid_at: x.paid_at })
        .eq('id', x.id)
        .select('id');

      if (error) fail(error);

      if (!data?.length) {
        fail('Transaksi tidak ditemukan atau tidak ada izin mengubahnya');
      }
    },

    /* ==========================================================
       PRODUKSI
       ========================================================== */

    /*
      Menyimpan catatan produksi.
      Penambahan stok produk dilakukan terpisah melalui
      addProductionStock().
    */
   async addBatch(b) {
  if (!c) return;

  need();

  if (!b) fail('Data produksi tidak valid');

  const ikan = Number(b.ikan || 0);
  const tap = Number(b.tap || 0);
  const hasil = Number(b.out || 0);

  if (ikan < 0 || tap < 0 || hasil <= 0) {
    fail(
      'Data produksi tidak valid. Hasil produksi harus lebih dari 0.'
    );
  }

  /* =========================================
     VALIDASI NERACA MASSA
     ========================================= */

  const massaInput = ikan + tap;

  if (massaInput <= 0) {
    fail('Total massa bahan harus lebih dari 0.');
  }

  if (hasil > massaInput) {
    fail(
      'Massa produk tidak boleh melebihi total massa bahan.'
    );
  }


  /* =========================================
     VALIDASI PARAMETER PROSES
     ========================================= */

  if (
    b.duration_min !== null &&
    b.duration_min !== undefined
  ) {
    const duration = Number(b.duration_min);

    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      fail(
        'Durasi proses harus lebih dari 0 menit.'
      );
    }
  }


  if (
    b.temperature_c !== null &&
    b.temperature_c !== undefined
  ) {
    const temperature = Number(b.temperature_c);

    if (
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 250
    ) {
      fail(
        'Temperatur proses tidak valid.'
      );
    }
  }


  if (
    b.energy_kwh !== null &&
    b.energy_kwh !== undefined
  ) {
    const energy = Number(b.energy_kwh);

    if (
      !Number.isFinite(energy) ||
      energy < 0
    ) {
      fail(
        'Konsumsi energi tidak valid.'
      );
    }
  }


  /* =========================================
     SIMPAN KE SUPABASE
     ========================================= */

  const { error } = await c
    .from('produksi')
    .insert(b);

  if (error) fail(error);
},

    /* ==========================================================
       PRODUK
       ========================================================== */

    async addProduct(p) {
      need();

      if (!p) fail('Data produk tidak valid');

      const sku = String(p.sku || '').trim().toUpperCase();

      if (!sku) fail('SKU produk wajib diisi');

      const { data: ex, error: exErr } = await c
        .from('products')
        .select('id,name,sku,stock')
        .eq('sku', sku)
        .maybeSingle();

      if (exErr) fail(exErr);

      if (ex) {
        fail(
          'SKU ' + sku + ' sudah digunakan oleh produk ' + ex.name +
          '. Gunakan Produksi untuk menambah stok hasil produksi ' +
          'atau Penyesuaian Stok untuk koreksi.'
        );
      }

      const stock = Number(p.stock || 0);

      if (!Number.isFinite(stock) || stock < 0) {
        fail('Stok awal produk tidak valid');
      }

      const payload = { ...p, sku, stock };

      const { data, error } = await c
        .from('products')
        .insert(payload)
        .select('*')
        .single();

      if (error) fail(error);

      /* Jika produk dibuat dengan stok awal,
         simpan riwayat inventory INITIAL. */
      if (payload.stock > 0) {
        const { error: me } = await c.from('inventory_movements').insert({
          product_id: data.id,
          movement_type: 'INITIAL',
          quantity: payload.stock,
          reference_type: 'PRODUCT',
          reference_id: String(data.id),
          note: 'Stok awal produk'
        });

        if (me) fail(me);
      }

      return strip(data);
    },

    async updateProduct(id, p) {
      need();

      if (!id) fail('Produk tidak valid');

      const payload = { ...p };

      if ('sku' in payload) {
        payload.sku = String(payload.sku || '').trim().toUpperCase();

        if (!payload.sku) fail('SKU produk wajib diisi');

        const { data: ex, error: ce } = await c
          .from('products')
          .select('id,name,sku')
          .eq('sku', payload.sku)
          .neq('id', id)
          .maybeSingle();

        if (ce) fail(ce);

        if (ex) {
          fail('SKU ' + payload.sku + ' sudah digunakan oleh produk ' + ex.name);
        }
      }

      /*
        PENTING:
        stok tidak boleh diubah dari Edit Produk.
        Gunakan: Produksi, Penyesuaian Stok, Penyelesaian Pesanan
      */
      delete payload.stock;

      const { data, error } = await c
        .from('products')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) fail(error);

      return strip(data);
    },

    /* ==========================================================
       STOK
       ========================================================== */

    async checkStock(productId, quantity) {
      need();

      const qty = Number(quantity);

      if (!productId) fail('Produk tidak valid');

      if (!Number.isFinite(qty) || qty <= 0) {
        fail('Jumlah produk harus lebih dari 0');
      }

      const { data, error } = await c.rpc('check_product_stock', {
        p_product_id: productId,
        p_quantity: qty
      });

      if (error) fail(error);

      return data;
    },

    /*
      PENYESUAIAN STOK

      Hanya untuk: stock opname, barang rusak, barang hilang,
      retur, koreksi pencatatan, penyesuaian lain.

      quantity: +5 = tambah 5, -3 = kurangi 3

      SQL: adjust_product_stock_safe
      Database bertanggung jawab mencegah stok negatif.
    */
    async adjustStock(productId, quantity, note = 'Penyesuaian stok') {
      need();

      const qty = Number(quantity);

      if (!productId) fail('Produk tidak valid');

      if (!Number.isFinite(qty) || qty === 0) {
        fail('Perubahan stok harus berupa angka dan tidak boleh 0');
      }

      const cleanNote = String(note || 'Penyesuaian stok').trim();

      const { data, error } = await c.rpc('adjust_product_stock_safe', {
        p_product_id: productId,
        p_quantity: qty,
        p_note: cleanNote
      });

      if (error) fail(error);

      const n = Number(data);

      if (!Number.isFinite(n)) {
        fail('Database tidak mengembalikan nilai stok yang valid');
      }

      return n;
    },

    /*
      HASIL PRODUKSI -> STOK +

      Dipisahkan dari adjustStock() supaya index.html memiliki
      jalur bisnis yang jelas. RPC yang digunakan tetap sama
      agar kompatibel dengan schema.sql lama.
    */
    async addProductionStock(productId, quantity, batchId = null) {
      need();

      const qty = Number(quantity);

      if (!productId || !Number.isFinite(qty) || qty <= 0) {
        fail('Produk atau jumlah hasil produksi tidak valid');
      }

      const note = batchId ? ('Hasil produksi batch ' + batchId) : 'Hasil produksi';

      return api.adjustStock(productId, qty, note);
    },

    /* ==========================================================
       PELANGGAN
       ========================================================== */

    async addCustomer(customer) {
      need();

      if (!customer) return null;

      const name = String(customer.name || '').trim();
      const phone = String(customer.phone || '').trim();

      if (!name) return null;

      /*
        Jika nomor HP sudah terdaftar, gunakan pelanggan lama.
        limit(1) membuat fungsi tetap aman apabila database lama
        memiliki nomor HP yang sama pada lebih dari satu baris.
      */
      if (phone) {
        const { data: f, error: fe } = await c
          .from('customers')
          .select('*')
          .eq('phone', phone)
          .order('id', { ascending: true })
          .limit(1);

        if (fe) fail(fe);

        const ex = f && f[0];

        if (ex) {
          /* Perbarui nama apabila nomor sama tetapi nama berubah. */
          if (ex.name !== name) {
            const { data: up, error: ue } = await c
              .from('customers')
              .update({ name })
              .eq('id', ex.id)
              .select('*')
              .single();

            if (ue) fail(ue);

            return strip(up);
          }

          return strip(ex);
        }
      }

      const payload = { name };
      if (phone) payload.phone = phone;

      const { data, error } = await c
        .from('customers')
        .insert(payload)
        .select('*')
        .single();

      if (error) fail(error);

      return strip(data);
    },

    /* ==========================================================
       PESANAN
       ========================================================== */

    /*
      Membuat pesanan baru.

      PENTING: membuat pesanan BELUM mengurangi stok.
      Stok baru berkurang ketika completeOrder().

      Hal ini memungkinkan status
      NEW, CONFIRMED, PROCESSING, READY_TO_SHIP, SHIPPED
      tanpa mengurangi stok berkali-kali.
    */
    async createOrder(order, items) {
      need();

      if (!order) fail('Data pesanan tidak valid');

      if (!Array.isArray(items) || !items.length) {
        fail('Pesanan harus memiliki minimal satu produk');
      }

      /*
        Gabungkan produk yang sama.
        Contoh: Bandeng 6 pcs + Bandeng 5 pcs
        akan diperiksa sebagai 11 pcs.
      */
      const grouped = new Map();

      for (const it of items) {
        if (!it.product_id) fail('Produk pesanan tidak valid');

        const q = Number(it.quantity);

        if (!Number.isFinite(q) || q <= 0) {
          fail('Jumlah produk harus lebih dari 0');
        }

        const k = String(it.product_id);

        if (!grouped.has(k)) {
          grouped.set(k, { ...it, quantity: 0 });
        }

        grouped.get(k).quantity += q;
      }

      /* Ambil seluruh produk pesanan dalam satu query. */
      const ids = [...grouped.values()].map(i => i.product_id);

      const { data: prods, error: pe } = await c
        .from('products')
        .select('*')
        .in('id', ids);

      if (pe) fail(pe);

      const byId = new Map((prods || []).map(p => [String(p.id), p]));

      const valid = [];

      for (const it of grouped.values()) {
        const p = byId.get(String(it.product_id));

        if (!p) fail('Produk tidak ditemukan');

        if (p.active === false) {
          fail('Produk ' + p.name + ' sedang nonaktif');
        }

        const stock = Number(p.stock || 0);
        const qty = Number(it.quantity);

        if (qty > stock) {
          fail(
            'Stok ' + p.name + ' tidak mencukupi. ' +
            'Tersedia ' + stock + ' pcs, tetapi diminta ' + qty + ' pcs.'
          );
        }

        const price = Number(it.unit_price ?? p.selling_price ?? 0);

        if (!Number.isFinite(price) || price < 0) {
          fail('Harga produk ' + p.name + ' tidak valid');
        }

        valid.push({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku || null,
          quantity: qty,
          unit_price: price,
          subtotal: qty * price
        });
      }

      const subtotal = valid.reduce((s, i) => s + i.subtotal, 0);
      const shipping = Number(order.shipping_cost || 0);
      const discount = Number(order.discount || 0);

      if (!Number.isFinite(shipping) || shipping < 0) fail('Ongkir tidak valid');
      if (!Number.isFinite(discount) || discount < 0) fail('Diskon tidak valid');

      const payload = {
        ...order,
        status: 'NEW',
        subtotal,
        shipping_cost: shipping,
        discount,
        total: Math.max(0, subtotal + shipping - discount)
      };

      /* Simpan pesanan utama. */
      const { data: saved, error: oe } = await c
        .from('orders')
        .insert(payload)
        .select('*')
        .single();

      if (oe) fail(oe);

      /* Simpan detail item. */
      const { data: savedItems, error: ie } = await c
        .from('order_items')
        .insert(valid.map(i => ({ order_id: saved.id, ...i })))
        .select('*');

      /* Jika detail gagal disimpan, hapus header order
         supaya tidak ada pesanan kosong. */
      if (ie) {
        try {
          await c.from('orders').delete().eq('id', saved.id);
        } catch (_) {}

        fail(ie);
      }

      return {
        order: strip(saved),
        items: (savedItems || []).map(strip)
      };
    },

    /*
      UPDATE STATUS PESANAN

      COMPLETED tidak boleh dilakukan melalui fungsi ini.
      Pesanan harus diselesaikan menggunakan completeOrder()
      supaya stok dan transaksi keuangan ikut diproses.
    */
    async updateOrder(id, changes) {
      need();

      if (!id) fail('Pesanan tidak valid');

      const ch = { ...changes };
      const ubahStatus = 'status' in ch;

      if (ubahStatus) {
        if (ch.status === 'COMPLETED') {
          fail('Gunakan completeOrder untuk menyelesaikan pesanan');
        }

        if (!ST_OK.includes(ch.status)) {
          fail('Status pesanan tidak dikenal');
        }
      }

      let q = c.from('orders').update(ch).eq('id', id);

      /* Pesanan yang sudah selesai atau dibatalkan
         tidak boleh dimodifikasi lagi. */
      if (ubahStatus) {
        q = q.not('status', 'in', '(COMPLETED,CANCELLED)');
      }

      const { data, error } = await q.select('*');

      if (error) fail(error);

      if (!data?.length) {
        fail('Pesanan sudah selesai/dibatalkan atau tidak ditemukan');
      }

      return strip(data[0]);
    },

    /*
      MENYELESAIKAN PESANAN

      Seluruh proses penting dilakukan oleh RPC complete_order_safe.
      Database bertanggung jawab atas:
      1. Mengecek stok terbaru
      2. Mengurangi stok
      3. Membuat inventory movement
      4. Mengubah status pesanan menjadi COMPLETED
      5. Membuat transaksi penjualan

      Dengan demikian satu pesanan tidak boleh
      mengurangi stok dua kali.
    */
    async completeOrder(order, items) {
      need();

      if (!order || !order.id) fail('Pesanan tidak valid');

      const { data, error } = await c.rpc('complete_order_safe', {
        p_order_id: order.id
      });

      if (error) fail(error);

      /* Beberapa versi RPC mengembalikan object:
         { success: true/false, message: "..." } */
      if (
        data &&
        typeof data === 'object' &&
        'success' in data &&
        data.success !== true
      ) {
        fail(data.message || 'Pesanan gagal diselesaikan');
      }

      return data;
    },

    /* ==========================================================
       PENGATURAN
       ========================================================== */

    /*
      Simpan konfigurasi dengan debounce 500ms.
      Digunakan untuk: harga ikan, harga tapioka, berat per bungkus,
      harga jual, rendemen, porsi ikan, biaya lainnya.
    */
    saveCfg(cfg) {
      if (!api.ready) return;

      clearTimeout(tm);

      tm = setTimeout(async () => {
        try {
          if (!user) return;

          const { error } = await c
            .from('pengaturan')
            .upsert({ user_id: user.id, cfg });

          if (error) {
            console.warn('Gagal menyimpan pengaturan:', error.message);
          }

        } catch (err) {
          console.warn('Gagal menyimpan pengaturan:', err);
        }
      }, 500);
    },

    /* ==========================================================
       MODE PENGEMBANG

       Hanya dapat digunakan jika URL memiliki ?dev=1
       Contoh: index.html?dev=1
       Jangan digunakan pada data produksi nyata.
       ========================================================== */

    async bulk(tx, b) {
      if (!DEV) fail('Hanya tersedia di mode pengembang');

      need();

      const t = await c.from('transaksi').upsert(tx);
      if (t.error) fail(t.error);

      const p = await c.from('produksi').upsert(b);
      if (p.error) fail(p.error);
    },

    async wipe() {
      if (!DEV) fail('Hanya tersedia di mode pengembang');

      need();

      const t = await c.from('transaksi').delete().neq('id', 0);
      if (t.error) fail(t.error);

      const p = await c.from('produksi').delete().neq('id', 0);
      if (p.error) fail(p.error);
    }
  };

  return api;

})();


/* ============================================================
   DATA DEMO
   Hanya digunakan pada mode ?dev=1
   ============================================================ */

function demoData() {

  let s = 11;

  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;

  const tx = [];
  const batch = [];

  const P = [
    ['tenggiri 250g', 14000],
    ['tenggiri 500g', 26000],
    ['ikan biasa 250g', 10000]
  ];

  const C = ['Toko Sari', 'Warung Bu Tini', 'Reseller Andi', 'Eceran', 'Toko Makmur'];

  let n = 1e12;

  const out = (date, cat, note, amt) =>
    tx.push({ id: n++, date, type: 'out', cat, note, amt, paid: true });

  for (let a = 60; a >= 0; a--) {

    const d = new Date();
    d.setDate(d.getDate() - a);

    const date = iso(d);

    for (let k = 0, m = 1 + (r() * 2 | 0); k < m; k++) {

      const p = P[r() * 3 | 0];
      const q = 5 + (r() * 25 | 0);
      const w = C[r() * 5 | 0];

      tx.push({
        id: n++,
        date,
        type: 'in',
        who: w,
        note: 'Jual ' + q + ' bks ' + p[0],
        amt: q * p[1],
        cat: 'Penjualan',
        paid: !(w != 'Eceran' && a < 10 && r() < .5)
      });
    }

    if ((a + 1) % 3 === 0) {
      out(date, 'Bahan baku', 'Beli ikan & tapioka', 300000 + (r() * 150000 | 0));
    }

    if ((a + 2) % 7 === 0) {
      out(date, 'Upah', 'Upah karyawan', 350000);
    }

    if ((a + 4) % 10 === 0) {
      out(date, 'Kemasan', 'Plastik kemasan', 95000);
    }

    if ((a + 5) % 12 === 0) {
      out(date, 'Gas & listrik', 'Gas elpiji', 75000);
    }

    if (a % 10 === 5) {

      const ik = 8 + (r() * 4 | 0);
      const tp = 18 + (r() * 6 | 0);

      batch.push({
        id: n++,
        date,
        ikan: ik,
        tap: tp,
        out: +((ik + tp) * (.72 + r() * .08)).toFixed(1)
      });
    }
  }

  return { tx, batch };
}


/* ============================================================
   HALAMAN AKUN
   ============================================================ */

function akun() {

  const u = DB.user;
  const e = Accounting.escape;
  const s = DB.sync;

  let h = '<h1>Akun &amp; Data</h1>';

  const info =
    s.sync === 'error'
      ? `<div class="notice">Gagal sinkron: ${e(s.error)}</div>`
      : s.at
        ? `<div class="sub">Terakhir sinkron: ${s.at.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>`
        : '';

  /* ---------------------- MODE LOKAL ---------------------- */

  if (!DB.on) {

    h += `
      <div class="card">
        <b>Mode lokal</b>
        <div class="sub">
          Supabase belum diisi di config.js.
          Data hanya tersimpan di perangkat ini.
        </div>
      </div>
    `;

  }

  /* ---------------------- SUDAH LOGIN ---------------------- */

  else if (u) {

    h += `
      <div class="card">
        <b>Masuk sebagai</b>
        <div>${e(u.email)}</div>
        <div class="sub">
          Peran: ${DB.role === 'owner' ? 'Pemilik' : DB.role === 'customer' ? 'Pembeli' : 'Karyawan'}
        </div>
        ${info}
        <button class="btn cta" data-resync>Muat Ulang Data</button>
        <button class="btn ghost" data-logout>Keluar</button>
      </div>
    `;

  }

  /* ---------------------- BELUM LOGIN ---------------------- */

  else {

    h += `
      <div class="card">
        <b>Masuk</b>

        <label>Email</label>
        <input id="em" type="email" autocomplete="email">

        <label>Kata sandi</label>
        <input id="pw" type="password" autocomplete="current-password">

        <button class="btn" data-login>Masuk</button>

        <div class="sub" style="margin-top:8px">
          Belum punya akun? Daftar sebagai pembeli di bawah ini.
        </div>
      </div>

      <div class="card">
        <b>Daftar sebagai pembeli</b>

        <label>Nama</label>
        <input id="rn" autocomplete="name">

        <label>Email</label>
        <input id="re" type="email" autocomplete="email">

        <label>Kata sandi (min. 6 karakter)</label>
        <input id="rw" type="password" autocomplete="new-password">

        <button class="btn cta" data-register>Daftar</button>
      </div>
    `;

  }

  /* ---------------------- MODE PENGEMBANG ---------------------- */

  if (DB.dev) {

    h += `
      <div class="card">
        <b>Mode pengembang</b>
        <div class="sub">
          Hanya terlihat dengan <b>?dev=1</b> pada alamat aplikasi.
          Jangan digunakan pada data usaha nyata.
        </div>
        <button class="btn cta" data-demo>Isi Data Contoh</button>
        <button class="btn danger" data-clear>Kosongkan Transaksi &amp; Produksi</button>
      </div>
    `;

  }

  return h;
}


/* ============================================================
   STATE KOSONG
   ============================================================ */

const EMPTY_S = () => ({
  tx: [],
  batch: [],
  products: [],
  customers: [],
  orders: [],
  orderItems: [],
  inventory: [],
  cfg: {
    ikan: 35000,
    tap: 12000,
    gram: 250,
    jual: 14000,
    share: 33,
    rend: 75,
    lain: 2500
  }
});


/* ============================================================
   EVENT: LOGIN / LOGOUT / MUAT ULANG / MODE DEV
   ============================================================ */

document.addEventListener('click', async ev => {

  const g = a => ev.target.closest('[' + a + ']');

  let el;

  /* ---------------------- LOGIN ---------------------- */

  if (el = g('data-login')) {

    const em = $('#em');
    const pw = $('#pw');

    if (!em || !pw) return toast('Form login tidak ditemukan');

    if (el.disabled) return;

    el.disabled = true;

    try {

      const m = await DB.auth(em.value.trim(), pw.value, false);

      if (m) return toast(m);

      const d = await DB.pull();

      if (!d) {
        return toast('Berhasil masuk, tetapi gagal memuat data: ' + DB.sync.error);
      }

      S = d;
      put();

      toast('Berhasil masuk');

      view = 'home';
      render();

    } finally {
      el.disabled = false;
    }
  }

  /* ---------------------- DAFTAR PEMBELI ---------------------- */

  if (el = g('data-register')) {

    if (el.disabled) return;

    el.disabled = true;

    try {

      const r = await DB.register(
        $('#rn')?.value.trim(),
        $('#re')?.value.trim(),
        $('#rw')?.value
      );

      if (r.error) return toast(r.error);

      if (r.confirm) {
        return toast('Pendaftaran berhasil. Cek email Anda untuk konfirmasi, lalu masuk.');
      }

      const d = await DB.pull();

      if (d) {
        S = d;
        put();
      }

      toast('Pendaftaran berhasil');

      view = 'shop';
      render();

    } finally {
      el.disabled = false;
    }
  }

  /* ---------------------- LOGOUT ---------------------- */

  if (g('data-logout')) {

    await DB.logout();

    S = EMPTY_S();

    toast('Sudah keluar');

    view = 'home';
    render();
  }

  /* ---------------------- RESYNC ---------------------- */

  if (g('data-resync')) {

    const d = await DB.pull();

    if (d) {
      S = d;
      put();
      toast('Data diperbarui');
    } else {
      toast('Gagal sinkron: ' + DB.sync.error);
    }

    render();
  }

  /* ---------------------- DATA DEMO ---------------------- */

  if (g('data-demo')) {

    if (!DB.dev) return;

    if (
      prompt(
        'Data transaksi & produksi akan DIGANTI. ' +
        'Ketik HAPUS untuk melanjutkan.'
      ) !== 'HAPUS'
    ) return;

    const d = demoData();

    try {

      await DB.wipe();
      await DB.bulk(d.tx, d.batch);

      S.tx = d.tx;
      S.batch = d.batch;
      put();

      toast('Data contoh terisi');

      view = 'home';
      render();

    } catch (err) {
      toast('Gagal: ' + err.message);
    }
  }

  /* ---------------------- HAPUS DATA DEMO ---------------------- */

  if (g('data-clear')) {

    if (!DB.dev) return;

    if (
      prompt(
        'Seluruh transaksi & produksi akan DIHAPUS. ' +
        'Ketik HAPUS untuk melanjutkan.'
      ) !== 'HAPUS'
    ) return;

    try {

      await DB.wipe();

      S.tx = [];
      S.batch = [];
      put();

      toast('Data dikosongkan');
      render();

    } catch (err) {
      toast('Gagal: ' + err.message);
    }
  }
});


/* ============================================================
   ENTER PADA PASSWORD = LOGIN
   ============================================================ */

document.addEventListener('keydown', ev => {

  if (ev.key === 'Enter' && ev.target.id === 'pw') {

    const b = document.querySelector('[data-login]');

    if (b) b.click();
  }
});