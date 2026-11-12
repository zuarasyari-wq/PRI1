/* Jalankan: node tests/accounting.test.js (tanpa npm) */
const assert=require('node:assert/strict');
require('../accounting.js');
const A=global.Accounting;
const tx=[
 {id:1,date:'2026-10-01',type:'in',cat:'Setoran modal',amt:10000000,paid:true},
 {id:2,date:'2026-10-02',type:'out',cat:'Bahan baku',amt:2000000,paid:true},
 {id:3,date:'2026-10-05',type:'in',cat:'Penjualan',amt:1500000,paid:true},
 {id:4,date:'2026-10-10',type:'out',cat:'Lain-lain',amt:500000,paid:true},
 {id:5,date:'2026-10-15',type:'out',cat:'Gas & listrik',amt:100000,paid:true},
];
const a=A.build(tx,'2026-10');
assert.equal(a.journal.length,5);
assert.equal(a.totalDebit,a.totalCredit);
assert.equal(a.cashflow.opening,0);
assert.equal(a.cashflow.closing,8900000);
assert.equal(a.cashflow.operating,-1100000);
assert.equal(a.cashflow.financing,10000000);
assert.equal(a.income.revenue,1500000);
assert.equal(a.income.profit,-1100000); // HPP dan persediaan belum diterapkan!
const p=[{id:11,date:'2026-09-28',type:'in',cat:'Penjualan',amt:120000,paid:true,paid_at:'2026-10-04'}];
const sep=A.build(p,'2026-09'),oct=A.build(p,'2026-10');
assert.equal(sep.income.revenue,120000);
assert.equal(sep.cashflow.closing,0);
assert.equal(sep.ledger['102'].closing,120000);
assert.equal(oct.income.revenue,0);
assert.equal(oct.cashflow.operating,120000);
assert.equal(oct.ledger['102'].opening,120000);
assert.equal(oct.ledger['102'].closing,0);
assert.equal(oct.cashflow.closing,120000);
assert.equal(oct.totalDebit,oct.totalCredit);
const pinjaman=A.build([{id:31,date:'2026-10-01',type:'in',cat:'Pinjaman diterima',amt:300000,paid:true}],'2026-10');
assert.equal(pinjaman.income.revenue,0);
assert.equal(pinjaman.cashflow.financing,300000);
assert.equal(pinjaman.trial.find(x=>x.code==='201').credit,300000);
assert.equal(A.escape('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');
// Mock fungsi SheetJS untuk menguji jumlah sheet tanpa ketergantungan eksternal
let filename='';
global.XLSX={utils:{book_new:()=>({sheets:[]}),aoa_to_sheet:rows=>({'!rows':rows}),decode_cell:()=>({c:0}),book_append_sheet:(wb,ws,name)=>wb.sheets.push({ws,name})},writeFile:(wb,path)=>{filename=path;assert.deepEqual(wb.sheets.map(s=>s.name),['Jurnal Umum','Buku Besar','Neraca Saldo','Laba Rugi','Arus Kas']);}};
A.exportExcel(tx,'2026-10');
assert.equal(filename,'Laporan-Olikans-2026-10.xlsx');
console.log('✓ 15 pemeriksaan jurnal, buku besar, neraca saldo, laba rugi, arus kas, dan struktur ekspor Excel berhasil.');
