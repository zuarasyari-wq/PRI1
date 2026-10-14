/* Olikans Accounting v1.1 — pembukuan OTOMATIS berbasis transaksi.
   Laporan turunan (bukan jurnal permanen yang diposting ke database).
   Mata uang IDR; seluruh angka dibulatkan ke rupiah.
   Catatan: HPP produksi dan persediaan aktual BELUM dihitung. */
(function(root){
  'use strict';
  const ACCOUNTS = [
    {code:'101',name:'Kas',normal:'D',kind:'asset'},
    {code:'102',name:'Piutang Usaha',normal:'D',kind:'asset'},
    {code:'201',name:'Utang Pinjaman',normal:'K',kind:'liability'},
    {code:'301',name:'Modal Pemilik',normal:'K',kind:'equity'},
    {code:'401',name:'Penjualan',normal:'K',kind:'revenue'},
    {code:'402',name:'Pendapatan Lain',normal:'K',kind:'revenue'},
    {code:'501',name:'Beban Bahan Baku',normal:'D',kind:'expense'},
    {code:'502',name:'Beban Kemasan',normal:'D',kind:'expense'},
    {code:'503',name:'Beban Gas & Listrik',normal:'D',kind:'expense'},
    {code:'504',name:'Beban Upah',normal:'D',kind:'expense'},
    {code:'505',name:'Beban Transportasi',normal:'D',kind:'expense'},
    {code:'506',name:'Beban Lain-lain',normal:'D',kind:'expense'}
  ];
  const MAP = Object.fromEntries(ACCOUNTS.map(a=>[a.code,a]));
  const CATOUT = {'Bahan baku':'501','Kemasan':'502','Gas & listrik':'503','Upah':'504','Transport':'505','Lain-lain':'506'};
  const amount = n => Math.round(Number(n) || 0);
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')) && !Number.isNaN(Date.parse(s+'T00:00:00'));
  const money = n => (n<0?'-':'')+'Rp '+Math.abs(amount(n)).toLocaleString('id-ID');
  const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const periodRange = period => { const p=/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period))?period:new Date().toISOString().slice(0,7); const [y,m]=p.split('-').map(Number); return {period:p,start:p+'-01',end:p+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0')}; };
  function prepare(transactions){
    const entries=[],warnings=[];
    let seq=0;
    function add(date,ref,description,debit,credit,value,flow){
      const id=ref+'-'+(++seq);
      entries.push({id,date,ref,description,flow,lines:[{account:debit,debit:value,credit:0},{account:credit,debit:0,credit:value}]});
    }
    (transactions||[]).forEach((x,index)=>{
      if(!isDate(x.date)||!Number.isFinite(Number(x.amt))||amount(x.amt)<=0 || !['in','out'].includes(x.type)){
        warnings.push('Transaksi #'+(index+1)+' diabaikan: tanggal, jenis, atau nominal tidak valid.'); return;
      }
      const n=amount(x.amt),cat=String(x.cat||''),ref='TX-'+String(x.id??index+1),description=String(x.note||x.who||cat||'Transaksi');
      if(x.type==='out'){
        const code=CATOUT[cat]||'506';
        add(x.date,ref,description,code,'101',n,'operating');
        return;
      }
      const normalized=cat.toLowerCase();
      let credit='401',flow='operating';
      if(normalized==='setoran modal'||normalized==='modal') {credit='301';flow='financing';}
      else if(normalized==='pinjaman diterima'||normalized==='pinjaman') {credit='201';flow='financing';}
      else if(normalized==='pendapatan lain'||normalized==='lain-lain') {credit='402';}
      if(credit!=='401'&&!x.paid){warnings.push(ref+' belum lunas, tetapi bukan penjualan. Penerimaan ini diabaikan sampai dilunasi.');return;}
      const settled=x.paid&&(x.paid_at||x.date);
      if(credit==='401' && (!settled||settled>x.date)){
        add(x.date,ref,description,'102',credit,n,null);
        if(settled && isDate(settled))add(settled,ref,'Pelunasan piutang: '+description,'101','102',n,'operating');
        else if(settled)warnings.push(ref+' memiliki paid_at yang tidak valid.');
      }else{
        add(x.date,ref,description,'101',credit,n,flow);
      }
    });
    entries.sort((a,b)=>a.date.localeCompare(b.date)||a.ref.localeCompare(b.ref)||a.id.localeCompare(b.id));
    return {entries,warnings};
  }
  function signed(entries,until,code){let n=0;entries.forEach(e=>{if(e.date>until)return;e.lines.forEach(l=>{if(l.account===code)n+=l.debit-l.credit;});});return amount(n);}
  function build(tx,period){
    const {start,end,period:p}=periodRange(period),{entries,warnings}=prepare(tx);
    const journal=entries.filter(e=>e.date>=start&&e.date<=end);
    const ledger={};
    ACCOUNTS.forEach(a=>{
      const opening=amount(entries.filter(e=>e.date<start).reduce((sum,e)=>sum+e.lines.reduce((s,l)=>s+(l.account===a.code?l.debit-l.credit:0),0),0));
      let balance=opening;
      const rows=[];
      journal.forEach(e=>e.lines.forEach(l=>{if(l.account===a.code){balance+=l.debit-l.credit;rows.push({date:e.date,ref:e.ref,description:e.description,debit:l.debit,credit:l.credit,balance:amount(balance)});}}));
      ledger[a.code]={account:a,opening,rows,closing:amount(balance)};
    });
    const trial=ACCOUNTS.map(a=>{
      const n=signed(entries,end,a.code);
      return {...a,debit:Math.max(n,0),credit:Math.max(-n,0)};
    }).filter(r=>r.debit||r.credit);
    const td=amount(trial.reduce((s,r)=>s+r.debit,0)),tc=amount(trial.reduce((s,r)=>s+r.credit,0));
    // Akun pendapatan bertambah pada kredit; saldo signed D-K; gunakan selisih periode.
    const pendapatan=amount(ACCOUNTS.filter(a=>a.kind==='revenue').reduce((s,a)=>s+ledger[a.code].opening-ledger[a.code].closing,0));
    const expenseItems=ACCOUNTS.filter(a=>a.kind==='expense').map(a=>({name:a.name,amount:amount(ledger[a.code].closing-ledger[a.code].opening)}));
    const expenses=amount(expenseItems.reduce((s,x)=>s+x.amount,0));
    const income={revenue:pendapatan,expenses,expenseItems,profit:pendapatan-expenses,isProvisional:true};
    const opening=ledger['101'].opening;
    const cashEvents=journal.flatMap(e=>{
      const kas=e.lines.find(l=>l.account==='101');
      if(!kas)return [];
      const other=e.lines.find(l=>l.account!=='101');
      const kind=['201','301'].includes(other?.account)?'financing':'operating';
      return [{date:e.date,ref:e.ref,description:e.description,kind,amount:amount(kas.debit-kas.credit)}];
    });
    const op=amount(cashEvents.filter(x=>x.kind==='operating').reduce((s,x)=>s+x.amount,0));
    const financing=amount(cashEvents.filter(x=>x.kind==='financing').reduce((s,x)=>s+x.amount,0));
    const cashflow={opening,events:cashEvents,operating:op,investing:0,financing,net:op+financing,closing:opening+op+financing};
    if(cashflow.closing!==ledger['101'].closing)warnings.push('Rekonsiliasi kas gagal, periksa data transaksi.');
    if(cashflow.closing<0)warnings.push('Saldo kas negatif. Periksa modal/saldo awal atau transaksi yang belum dicatat.');
    if(td!==tc)warnings.push('Neraca saldo tidak seimbang. Periksa jurnal.');
    return {start,end,period:p,accounts:ACCOUNTS,entries,journal,ledger,trial,totalDebit:td,totalCredit:tc,income,cashflow,warnings};
  }
  const lineRows= (data) => data.journal.flatMap(e=>e.lines.map(l=>[e.date,e.ref,e.description,l.account+' '+MAP[l.account].name,l.debit||null,l.credit||null]));
  function exportExcel(tx,period){
    if(!root.XLSX)throw new Error('Library ekspor Excel belum termuat. Pastikan perangkat terhubung internet lalu coba kembali.');
    const d=build(tx,period),wb=root.XLSX.utils.book_new();
    function sheet(name,rows,widths,moneyColumns){
      const ws=root.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=widths.map(w=>({wch:w}));
      for(const key of Object.keys(ws)){
        if(key[0]==='!')continue;
        const cell=ws[key],col=root.XLSX.utils.decode_cell(key).c;
        if(moneyColumns.includes(col) && cell.t==='n')cell.z='"Rp" #,##0;[Red]("Rp" #,##0)';
      }
      root.XLSX.utils.book_append_sheet(wb,ws,name);
    }
    sheet('Jurnal Umum',[[`Jurnal Umum — ${d.period}`],['Tanggal','Ref','Keterangan','Akun','Debit','Kredit'],...lineRows(d)],[14,21,42,31,20,20],[4,5]);
    const led=[['Buku Besar — '+d.period],['Akun','Tanggal','Ref','Keterangan','Debit','Kredit','Saldo Absolut','Posisi']];
    Object.values(d.ledger).forEach(l=>{
      if(!l.rows.length && !l.opening)return;
      led.push([l.account.code+' '+l.account.name,'Saldo awal',null,null,null,null,Math.abs(l.opening),l.opening>=0?'Debit':'Kredit']);
      l.rows.forEach(r=>led.push([l.account.code+' '+l.account.name,r.date,r.ref,r.description,r.debit||null,r.credit||null,Math.abs(r.balance),r.balance>=0?'Debit':'Kredit']));
    });
    sheet('Buku Besar',led,[30,14,22,42,20,20,23,13],[4,5,6]);
    sheet('Neraca Saldo',[[`Neraca Saldo per ${d.end}`],['Kode Akun','Nama Akun','Debit','Kredit'],...d.trial.map(r=>[r.code,r.name,r.debit||null,r.credit||null]),['','TOTAL',d.totalDebit,d.totalCredit]],[17,34,22,22],[2,3]);
    sheet('Laba Rugi',[[`Laba Rugi Indikatif — ${d.period}`],['Keterangan','Nilai'],['Pendapatan',d.income.revenue],...d.income.expenseItems.map(x=>[x.name,-x.amount]),['Total Beban',-d.income.expenses],['Surplus / (Defisit) Indikatif',d.income.profit],['Catatan: pembelian bahan/kemasan langsung menjadi beban; HPP dan nilai persediaan belum dihitung.']],[90,24],[1]);
    sheet('Arus Kas',[[`Arus Kas — ${d.period}`],['Keterangan','Nilai'],['Kas awal',d.cashflow.opening],['Operasi',d.cashflow.operating],['Investasi',d.cashflow.investing],['Pendanaan',d.cashflow.financing],['Perubahan kas',d.cashflow.net],['Kas akhir',d.cashflow.closing],[],['Tanggal','Ref','Keterangan','Kelompok','Arus kas'],...d.cashflow.events.map(e=>[e.date,e.ref,e.description,e.kind,e.amount])],[24,28,44,19,21],[1,4]);
    root.XLSX.writeFile(wb,'Laporan-Olikans-'+d.period+'.xlsx');
  }
  function cashHistory(tx){return prepare(tx).entries.flatMap(e=>{const kas=e.lines.find(l=>l.account==='101');return kas?[{date:e.date,amt:amount(kas.debit-kas.credit)}]:[];});}
  root.Accounting={ACCOUNTS,build,exportExcel,cashHistory,money,escape,periodRange};
})(typeof window==='undefined'?globalThis:window);
