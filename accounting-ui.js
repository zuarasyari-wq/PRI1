/* Tampilan laporan akuntansi, membutuhkan Accounting, S, dan render() dari index.html */
const AUI=(()=>{
 let section='jurnal',month=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')})(),code='101';
 const rp=n=>Accounting.money(n),esc=Accounting.escape;
 const empty='<tr><td colspan="6" class="sub">Belum ada data pada periode ini.</td></tr>';
 const cell=n=>n?rp(n):'–';
 const pos=n=>Math.abs(n)?rp(Math.abs(n))+' ('+(n>=0?'Debit':'Kredit')+')':'Rp 0';
 const table=(headers,body)=>`<div class="table-scroll"><table class="acct-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${body||empty}</tbody></table></div>`;
 const tr=(cols,css='')=>`<tr class="${css}">${cols.map((v,i)=>`<td>${v}</td>`).join('')}</tr>`;
 const btn=(key,title)=>`<button class="${section===key?'on':''}" data-acct-tab="${key}">${title}</button>`;
 function journal(d){
  const rows=d.journal.flatMap(e=>e.lines.map((l,i)=>tr([esc(e.date),esc(e.ref),esc(i?('↳ '+e.description):e.description),esc(l.account+' '+d.accounts.find(a=>a.code===l.account).name),cell(l.debit),cell(l.credit)]))).join('');
  const debit=d.journal.reduce((s,e)=>s+e.lines.reduce((n,l)=>n+l.debit,0),0);
  return table(['Tanggal','Ref','Keterangan','Akun','Debit','Kredit'],rows+tr(['','','<b>Total</b>','',`<b>${cell(debit)}</b>`,`<b>${cell(debit)}</b>`],'total'));
 }
 function ledger(d){
  const x=d.ledger[code],opts=d.accounts.map(a=>`<option value="${a.code}" ${a.code===code?'selected':''}>${a.code} — ${esc(a.name)}</option>`).join('');
  const rows=tr(['Sebelumnya','–','Saldo awal','–','–',pos(x.opening)],'total')+x.rows.map(r=>tr([esc(r.date),esc(r.ref),esc(r.description),cell(r.debit),cell(r.credit),pos(r.balance)])).join('')+tr(['','','<b>Saldo akhir</b>','','',`<b>${pos(x.closing)}</b>`],'total');
  return `<label for="acct-account">Pilih akun buku besar</label><select id="acct-account">${opts}</select>`+table(['Tanggal','Referensi','Keterangan','Debit','Kredit','Saldo'],rows);
 }
 function trial(d){
  const rows=d.trial.map(a=>tr([esc(a.code),esc(a.name),cell(a.debit),cell(a.credit)])).join('')+
   tr(['','<b>Jumlah</b>',`<b>${rp(d.totalDebit)}</b>`,`<b>${rp(d.totalCredit)}</b>`],'total');
  return table(['Kode','Nama akun','Debit','Kredit'],rows)+`<p class="sub">${d.totalDebit===d.totalCredit?'✓ Total debit dan kredit seimbang.':'⚠ Total debit dan kredit tidak seimbang.'} Keseimbangan tidak menjamin bebas salah klasifikasi.</p>`;
 }
 function income(d){
  const a=d.income;
  const rows=tr(['Penjualan dan pendapatan lain',rp(a.revenue)])+
   a.expenseItems.filter(x=>x.amount).map(x=>tr([esc(x.name),'('+rp(x.amount)+')'])).join('')+
   tr(['<b>Total beban</b>','<b>('+rp(a.expenses)+')</b>'],'total')+
   tr(['<b>Surplus / (defisit) indikatif</b>',`<b class="${a.profit<0?'out':'in'}">${rp(a.profit)}</b>`],'total');
  return table(['Komponen laporan','Nilai'],rows)+`<p class="notice"><b>Belum merupakan laba bersih final.</b> Pembelian bahan baku/kemasan saat ini langsung menjadi beban, sementara sistem belum mengalokasikan biaya produksi, persediaan akhir dan HPP aktual. Untuk laporan laba rugi yang akurat, perlu modul persediaan dan HPP.</p>`;
 }
 function cashflow(d){
  const x=d.cashflow;
  const rows=[['Kas awal periode',x.opening],['A. Arus kas operasi',x.operating],['B. Arus kas investasi',x.investing],['C. Arus kas pendanaan',x.financing],['Kenaikan / penurunan kas',x.net],['Kas akhir periode',x.closing]]
   .map(([k,v],i)=>tr([i===5?'<b>'+k+'</b>':k,i===5?'<b>'+rp(v)+'</b>':rp(v)],i===5?'total':'')).join('');
  const movements=x.events.map(e=>tr([esc(e.date),esc(e.description),esc(e.kind==='financing'?'Pendanaan':'Operasi'),rp(e.amount)])).join('');
  return table(['Kelompok','Nilai'],rows)+'<h2>Rincian mutasi kas</h2>'+table(['Tanggal','Keterangan','Aktivitas','Arus kas'],movements)+
   '<p class="sub">Aktivitas investasi belum tersedia sebagai kategori transaksi tersendiri. Pelunasan piutang dihitung pada tanggal uang diterima.</p>';
 }
 function render(){
  const d=Accounting.build(S.tx,month);
  const notes=d.warnings.length?`<div class="notice"><b>Peringatan data:</b><ul>${d.warnings.slice(0,5).map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:'';
  return `<h1>Akuntansi & Laporan</h1><div class="card"><label for="acct-month">Periode laporan</label><input type="month" id="acct-month" value="${esc(d.period)}"><div class="sub">Transaksi dijurnal otomatis; neraca saldo menampilkan saldo kumulatif sampai ${esc(d.end)}.</div></div>
   <div class="acct-tabs">${btn('jurnal','Jurnal')}${btn('buku','Buku besar')}${btn('neraca','Neraca saldo')}${btn('laba','Laba rugi')}${btn('kas','Arus kas')}</div>
   ${notes}<div class="card"><b>${({jurnal:'Jurnal Umum',buku:'Buku Besar',neraca:'Neraca Saldo',laba:'Laporan Laba Rugi',kas:'Laporan Arus Kas'})[section]} — ${esc(d.period)}</b><div class="sub">Semua nominal dalam rupiah.</div>
   ${({jurnal:()=>journal(d),buku:()=>ledger(d),neraca:()=>trial(d),laba:()=>income(d),kas:()=>cashflow(d)})[section]()}</div>
   <button class="btn" data-acct-export>⬇ Ekspor 5 laporan ke Excel (.xlsx)</button>
   <div class="card"><b>Catatan akuntansi</b><p class="sub">Jurnal, buku besar, dan laporan dihitung dari tabel transaksi. Data belum diposting sebagai jurnal permanen, belum ada audit trail, tutup buku, nilai persediaan, HPP aktual, atau rekonsiliasi bank. Gunakan untuk pembukuan awal, bukan laporan final untuk audit atau pajak.</p></div>`;
 }
 return {render,setSection:s=>{section=s},setMonth:s=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(s))month=s},setAccount:s=>{if(Accounting.ACCOUNTS.some(a=>a.code===s))code=s},export:()=>Accounting.exportExcel(S.tx,month)};
})();

document.addEventListener('click',e=>{
 const a=e.target.closest('[data-acct-tab]');if(a){AUI.setSection(a.dataset.acctTab);render();}
 if(e.target.closest('[data-acct-export]'))try{AUI.export();toast('File Excel disiapkan.');}catch(err){toast(err.message||'Gagal mengekspor file.');}
});
document.addEventListener('change',e=>{
 if(e.target.id==='acct-month'){AUI.setMonth(e.target.value);render();}
 if(e.target.id==='acct-account'){AUI.setAccount(e.target.value);render();}
});
