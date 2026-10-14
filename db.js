/* Lapisan Supabase + data contoh + halaman Akun. Dimuat sebelum script utama di index.html */
const DB=(()=>{
 let c=null,user=null,tm;
 const log=e=>{if(e)console.warn('Supabase:',e.message||e);return !e};
 const strip=({user_id,created_at,...x})=>x;
 return{
  get on(){return !!c}, get user(){return user}, get ready(){return !!(c&&user)},
  async boot(){ // dipanggil sekali saat aplikasi dibuka
   const k=window.KAS_CONFIG||{};
   if(!k.url||!k.anonKey||!window.supabase)return null; // mode lokal
   c=window.supabase.createClient(k.url,k.anonKey);
   user=(await c.auth.getSession()).data.session?.user||null;
   return user?DB.pull():null},
  async pull(){ // paginasi: Supabase umumnya membatasi hasil per permintaan
   async function all(table){let rows=[];for(;;){const {data,error}=await c.from(table).select('*').order('date').order('id').range(rows.length,rows.length+499);if(error)throw new Error(error.message);rows.push(...data);if(data.length<500)return rows;}}
   try{const [tx,batch,p]=await Promise.all([all('transaksi'),all('produksi'),c.from('pengaturan').select('cfg').maybeSingle()]);
    if(p.error)throw new Error(p.error.message);return{tx:tx.map(strip),batch:batch.map(strip),cfg:{...S.cfg,...(p.data?.cfg||{})}};
   }catch(err){log(err);return null}
  },
  async auth(em,pw,daftar){ // kembalikan pesan, kosong = sukses
   const r=daftar?await c.auth.signUp({email:em,password:pw}):await c.auth.signInWithPassword({email:em,password:pw});
   if(r.error)return r.error.message;
   user=r.data.session?.user||null;
   return user?'':'Cek email untuk konfirmasi, lalu masuk.'},
  async logout(){await c.auth.signOut();user=null;localStorage.removeItem('kas-umkm-v1')},
  async addTx(x){if(!DB.ready)return;const {error}=await c.from('transaksi').insert(x);if(error)throw new Error(error.message)},
  async updTx(x){if(!DB.ready)return;const {error}=await c.from('transaksi').update({paid:x.paid,paid_at:x.paid_at}).eq('id',x.id);if(error)throw new Error(error.message)},
  async addBatch(b){if(!DB.ready)return;const {error}=await c.from('produksi').insert(b);if(error)throw new Error(error.message)},
  saveCfg(cfg){if(!DB.ready)return;clearTimeout(tm); // tunda 0,8 dtk agar tidak kirim tiap ketukan
   tm=setTimeout(async()=>log((await c.from('pengaturan').upsert({user_id:user.id,cfg,updated_at:new Date().toISOString()})).error),800)},
  async bulk(tx,b){if(!DB.ready)return;const t=await c.from('transaksi').upsert(tx);if(t.error)throw new Error(t.error.message);const p=await c.from('produksi').upsert(b);if(p.error)throw new Error(p.error.message)},
  async wipe(){if(!DB.ready)return;const t=await c.from('transaksi').delete().neq('id',0);if(t.error)throw new Error(t.error.message);const p=await c.from('produksi').delete().neq('id',0);if(p.error)throw new Error(p.error.message)}
 }})();

/* Data contoh: 60 hari usaha kerupuk ikan (angka karangan, hanya untuk demo) */
function demoData(){
 let s=11;const r=()=>(s=(s*9301+49297)%233280)/233280,tx=[],batch=[],id=1e12,
 P=[['tenggiri 250g',14000],['tenggiri 500g',26000],['ikan biasa 250g',10000]],C=['Toko Sari','Warung Bu Tini','Reseller Andi','Eceran','Toko Makmur'];
 let n=id;const out=(date,cat,note,amt)=>tx.push({id:n++,date,type:'out',cat,note,amt,paid:true});
 for(let a=60;a>=0;a--){const d=new Date();d.setDate(d.getDate()-a);const date=iso(d);
  for(let k=0,m=1+(r()*2|0);k<m;k++){const p=P[r()*3|0],q=5+(r()*25|0),w=C[r()*5|0];
   tx.push({id:n++,date,type:'in',who:w,note:'Jual '+q+' bks '+p[0],amt:q*p[1],cat:'Penjualan',paid:!(w!='Eceran'&&a<10&&r()<.5)})}
  if((a+1)%3==0)out(date,'Bahan baku','Beli ikan & tapioka',300000+(r()*150000|0));
  if((a+2)%7==0)out(date,'Upah','Upah karyawan',350000);
  if((a+4)%10==0)out(date,'Kemasan','Plastik kemasan',95000);
  if((a+5)%12==0)out(date,'Gas & listrik','Gas elpiji',75000);
  if(a%10==5){const ik=8+(r()*4|0),tp=18+(r()*6|0);batch.push({id:n++,date,ikan:ik,tap:tp,out:+((ik+tp)*(.72+r()*.08)).toFixed(1)})}}
 return{tx,batch}}

/* Halaman Akun */
function akun(){const u=DB.user,b='style="background:var(--out)"';
 return `<h1>Akun & data</h1>`+(!DB.on
  ?`<div class="card"><b>Mode lokal</b><div class="sub">Supabase belum diisi di config.js, jadi data hanya tersimpan di HP ini.</div></div>`
  :u?`<div class="card"><b>Masuk sebagai</b><div>${Accounting.escape(u.email)}</div><div class="sub">Data tersinkron ke Supabase.</div><button class="btn" ${b} data-logout>Keluar</button></div>`
  :`<div class="card"><b>Masuk</b><label>Email</label><input id="em" type="email" autocomplete="email"><label>Kata sandi (min. 6 karakter)</label><input id="pw" type="password" autocomplete="current-password"><button class="btn" data-login>Masuk</button><button class="btn" style="background:var(--sea)" data-signup>Daftar akun baru</button></div>`)+
 `<div class="card"><b>Data contoh untuk demo</b><div class="sub">Mengisi 60 hari penjualan, pengeluaran, piutang, dan 6 catatan produksi. Data yang ada akan diganti.</div><button class="btn" style="background:var(--gold);color:#3a2800" data-demo>Isi data contoh</button><button class="btn" ${b} data-clear>Kosongkan semua data</button></div>`}

document.addEventListener('click',async e=>{const g=a=>e.target.closest('['+a+']');
 if(g('data-login')||g('data-signup')){const m=await DB.auth($('#em').value.trim(),$('#pw').value,!!g('data-signup'));
  if(m)return toast(m);const d=await DB.pull();if(d){S=d;put()}toast('Berhasil masuk');render()}
 if(g('data-logout')){await DB.logout();S={tx:[],batch:[],cfg:{ikan:35000,tap:12000,gram:250,jual:14000,share:33,rend:75,lain:2500}};toast('Sudah keluar');render()}
 if(g('data-demo')){if(!confirm('PERINGATAN: ini akan mengganti seluruh transaksi dan produksi. Cadangkan data terlebih dahulu. Lanjutkan?'))return;const d=demoData();
  try{await DB.wipe();await DB.bulk(d.tx,d.batch);S.tx=d.tx;S.batch=d.batch;put();toast('Data contoh terisi');view='home';render()}catch(err){toast('Gagal membuat data contoh: '+err.message)}}
 if(g('data-clear')){if(!confirm('Hapus SELURUH data transaksi dan produksi? Tindakan ini tidak dapat dibatalkan.'))return;try{await DB.wipe();S.tx=[];S.batch=[];put();toast('Data dikosongkan');render()}catch(err){toast('Gagal menghapus data: '+err.message)}}});
