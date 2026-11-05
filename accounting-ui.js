/* =========================================================
   OLIKANS ACCOUNTING UI v2.2
   Tampilan Laporan Usaha + Detail Akuntansi

   Membutuhkan:
   - Accounting dari accounting.js
   - S dari index.html
   - render() dari index.html
   - toast() dari index.html

   Prinsip tampilan:
   - UMKM melihat ringkasan usaha terlebih dahulu.
   - Laba rugi dan arus kas dibuat mudah dipahami.
   - Jurnal, buku besar, dan neraca saldo tetap tersedia.
   ========================================================= */

const AUI = (() => {
  'use strict';


  /* =======================================================
     1. STATE
     ======================================================= */

  let section = 'ringkasan';

  let month = (() => {
    const d = new Date();

    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0')
    );
  })();

  let code = '101';


  /* =======================================================
     2. HELPER
     ======================================================= */

  const rp = value =>
    Accounting.money(value);


  const esc = value =>
    Accounting.escape(value);


  const cell = value =>
    value ? rp(value) : '–';


  const pos = value => {
    if (!Math.abs(value)) {
      return 'Rp 0';
    }

    return (
      rp(Math.abs(value)) +
      ' (' +
      (value >= 0 ? 'Debit' : 'Kredit') +
      ')'
    );
  };


  const empty = columns => `
    <tr>
      <td colspan="${columns}" class="sub">
        Belum ada data pada periode ini.
      </td>
    </tr>
  `;


  const table = (
    headers,
    body,
    emptyColumns = headers.length
  ) => `
    <div class="table-scroll">
      <table class="acct-table">
        <thead>
          <tr>
            ${headers
              .map(header => `<th>${header}</th>`)
              .join('')}
          </tr>
        </thead>

        <tbody>
          ${body || empty(emptyColumns)}
        </tbody>
      </table>
    </div>
  `;


  const tr = (columns, css = '') => `
    <tr class="${css}">
      ${columns
        .map(value => `<td>${value}</td>`)
        .join('')}
    </tr>
  `;


  const btn = (key, title) => `
    <button
      type="button"
      class="${section === key ? 'on' : ''}"
      data-acct-tab="${key}"
    >
      ${title}
    </button>
  `;


  /* =======================================================
     3. FORMAT PERIODE
     ======================================================= */

  function periodName(period) {
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember'
    ];

    const parts =
      String(period || '').split('-');

    if (parts.length !== 2) {
      return period;
    }

    const year = Number(parts[0]);
    const monthNumber = Number(parts[1]);

    if (
      !year ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {
      return period;
    }

    return (
      months[monthNumber - 1] +
      ' ' +
      year
    );
  }


  /* =======================================================
     4. RINGKASAN USAHA
     ======================================================= */

  function summary(data) {
    const income = data.income;
    const cash = data.cashflow;

    const profitClass =
      income.profit < 0
        ? 'out'
        : 'in';

    const profitLabel =
      income.profit < 0
        ? 'Defisit'
        : 'Surplus';


    const revenueDetails =
      (income.revenueItems || [])
        .filter(item => item.amount)
        .map(item => `
          <div class="acct-summary-row">
            <span>${esc(item.name)}</span>
            <b>${rp(item.amount)}</b>
          </div>
        `)
        .join('');


    const expenseDetails =
      (income.expenseItems || [])
        .filter(item => item.amount)
        .map(item => `
          <div class="acct-summary-row">
            <span>${esc(item.name)}</span>
            <b>${rp(item.amount)}</b>
          </div>
        `)
        .join('');


    return `
      <div class="acct-overview">

        <div class="acct-stat">
          <div class="acct-stat-label">
            Pendapatan
          </div>

          <div class="acct-stat-value in">
            ${rp(income.revenue)}
          </div>

          <div class="sub">
            Penjualan dan pendapatan lain
          </div>
        </div>


        <div class="acct-stat">
          <div class="acct-stat-label">
            Pengeluaran
          </div>

          <div class="acct-stat-value out">
            ${rp(income.expenses)}
          </div>

          <div class="sub">
            Beban usaha periode ini
          </div>
        </div>


        <div class="acct-stat">
          <div class="acct-stat-label">
            ${profitLabel}
          </div>

          <div class="acct-stat-value ${profitClass}">
            ${rp(income.profit)}
          </div>

          <div class="sub">
            Pendapatan dikurangi beban
          </div>
        </div>


        <div class="acct-stat">
          <div class="acct-stat-label">
            Kas Akhir
          </div>

          <div class="acct-stat-value">
            ${rp(cash.closing)}
          </div>

          <div class="sub">
            Estimasi saldo kas usaha
          </div>
        </div>

      </div>


      <div class="acct-grid">

        <div class="acct-mini-card">

          <div class="acct-mini-title">
            Pendapatan Bulan Ini
          </div>

          ${
            revenueDetails ||
            `
              <div class="sub">
                Belum ada pendapatan pada periode ini.
              </div>
            `
          }

          <div class="acct-summary-row total-line">
            <span>Total Pendapatan</span>
            <b class="in">
              ${rp(income.revenue)}
            </b>
          </div>

        </div>


        <div class="acct-mini-card">

          <div class="acct-mini-title">
            Pengeluaran Bulan Ini
          </div>

          ${
            expenseDetails ||
            `
              <div class="sub">
                Belum ada pengeluaran pada periode ini.
              </div>
            `
          }

          <div class="acct-summary-row total-line">
            <span>Total Pengeluaran</span>
            <b class="out">
              ${rp(income.expenses)}
            </b>
          </div>

        </div>

      </div>


      <div class="acct-mini-card">

        <div class="acct-mini-title">
          Kondisi Arus Kas
        </div>

        <div class="acct-summary-row">
          <span>Kas awal periode</span>
          <b>${rp(cash.opening)}</b>
        </div>

        <div class="acct-summary-row">
          <span>Arus kas operasi</span>
          <b class="${cash.operating < 0 ? 'out' : 'in'}">
            ${rp(cash.operating)}
          </b>
        </div>

        <div class="acct-summary-row">
          <span>Arus kas pendanaan</span>
          <b class="${cash.financing < 0 ? 'out' : 'in'}">
            ${rp(cash.financing)}
          </b>
        </div>

        <div class="acct-summary-row total-line">
          <span>Kas akhir periode</span>
          <b>
            ${rp(cash.closing)}
          </b>
        </div>

      </div>


      <div class="notice">
        <b>Catatan laporan usaha</b>

        <div class="sub" style="margin-top:6px">
          Surplus/defisit di atas masih bersifat indikatif.
          Sistem saat ini mencatat pembelian bahan, kemasan,
          gas/listrik, upah, transportasi, dan pengeluaran lain
          sebagai beban saat transaksi terjadi.
          HPP aktual dan nilai persediaan akhir belum dihitung.
        </div>
      </div>
    `;
  }


  /* =======================================================
     5. LABA RUGI
     ======================================================= */

  function income(data) {
    const report = data.income;


    const revenueRows =
      (report.revenueItems || [])
        .filter(item => item.amount)
        .map(item =>
          tr([
            esc(item.name),
            rp(item.amount)
          ])
        )
        .join('');


    const expenseRows =
      (report.expenseItems || [])
        .filter(item => item.amount)
        .map(item =>
          tr([
            esc(item.name),
            '(' + rp(item.amount) + ')'
          ])
        )
        .join('');


    const rows =
      revenueRows +

      tr(
        [
          '<b>Total pendapatan</b>',
          `<b>${rp(report.revenue)}</b>`
        ],
        'total'
      ) +

      expenseRows +

      tr(
        [
          '<b>Total beban</b>',
          `<b>(${rp(report.expenses)})</b>`
        ],
        'total'
      ) +

      tr(
        [
          report.profit >= 0
            ? '<b>Surplus indikatif</b>'
            : '<b>Defisit indikatif</b>',

          `
            <b class="${report.profit < 0 ? 'out' : 'in'}">
              ${rp(report.profit)}
            </b>
          `
        ],
        'total'
      );


    return `
      ${table(
        [
          'Komponen laporan',
          'Nilai'
        ],
        rows,
        2
      )}

      <div class="notice">
        <b>Belum merupakan laba bersih final.</b>

        <div class="sub" style="margin-top:6px">
          Sistem belum menghitung HPP aktual,
          alokasi biaya produksi, dan nilai persediaan akhir.
          Karena itu hasil laporan ini digunakan sebagai
          gambaran awal kinerja usaha.
        </div>
      </div>
    `;
  }


  /* =======================================================
     6. ARUS KAS
     ======================================================= */

  function cashflow(data) {
    const cash = data.cashflow;


    const rows = [
      [
        'Kas awal periode',
        cash.opening
      ],
      [
        'Arus kas operasi',
        cash.operating
      ],
      [
        'Arus kas investasi',
        cash.investing
      ],
      [
        'Arus kas pendanaan',
        cash.financing
      ],
      [
        'Kenaikan / penurunan kas',
        cash.net
      ],
      [
        'Kas akhir periode',
        cash.closing
      ]
    ]
      .map(([label, value], index) => {

        const isLast =
          index === 5;

        return tr(
          [
            isLast
              ? `<b>${label}</b>`
              : label,

            isLast
              ? `<b>${rp(value)}</b>`
              : rp(value)
          ],
          isLast
            ? 'total'
            : ''
        );

      })
      .join('');


    const movements =
      cash.events
        .map(event => {

          const activity =
            event.kind === 'financing'
              ? 'Pendanaan'
              : 'Operasi';


          return tr([
            esc(event.date),
            esc(event.description),
            activity,

            `
              <span class="${event.amount < 0 ? 'out' : 'in'}">
                ${rp(event.amount)}
              </span>
            `
          ]);

        })
        .join('');


    return `
      ${table(
        [
          'Kelompok',
          'Nilai'
        ],
        rows,
        2
      )}

      <h2 style="margin-top:22px">
        Rincian Mutasi Kas
      </h2>

      ${table(
        [
          'Tanggal',
          'Keterangan',
          'Aktivitas',
          'Arus kas'
        ],
        movements,
        4
      )}

      <p class="sub">
        Pelunasan piutang dihitung pada tanggal uang diterima.
        Aktivitas investasi belum tersedia sebagai kategori
        transaksi tersendiri.
      </p>
    `;
  }


  /* =======================================================
     7. JURNAL UMUM
     ======================================================= */

  function journal(data) {

    const rows =
      data.journal
        .flatMap(entry =>

          entry.lines.map(
            (line, index) => {

              const account =
                data.accounts.find(
                  item =>
                    item.code === line.account
                );


              return tr([
                esc(entry.date),

                esc(entry.ref),

                esc(
                  index
                    ? '↳ ' + entry.description
                    : entry.description
                ),

                esc(
                  line.account +
                  ' ' +
                  (account
                    ? account.name
                    : 'Akun')
                ),

                cell(line.debit),

                cell(line.credit)
              ]);

            }

          )

        )
        .join('');


    const debit =
      data.journal.reduce(
        (sum, entry) =>
          sum +
          entry.lines.reduce(
            (value, line) =>
              value +
              Number(line.debit || 0),
            0
          ),
        0
      );


    const body =
      rows +

      tr(
        [
          '',
          '',
          '<b>Total</b>',
          '',
          `<b>${cell(debit)}</b>`,
          `<b>${cell(debit)}</b>`
        ],
        'total'
      );


    return table(
      [
        'Tanggal',
        'Ref',
        'Keterangan',
        'Akun',
        'Debit',
        'Kredit'
      ],
      body,
      6
    );
  }


  /* =======================================================
     8. BUKU BESAR
     ======================================================= */

  function ledger(data) {

    /*
     * Jika akun yang sebelumnya dipilih tidak ditemukan,
     * kembali ke akun Kas.
     */
    if (!data.ledger[code]) {
      code = '101';
    }


    const selected =
      data.ledger[code];


    const options =
      data.accounts
        .map(account => `
          <option
            value="${account.code}"
            ${account.code === code ? 'selected' : ''}
          >
            ${account.code} — ${esc(account.name)}
          </option>
        `)
        .join('');


    const rows =
      tr(
        [
          'Sebelumnya',
          '–',
          'Saldo awal',
          '–',
          '–',
          pos(selected.opening)
        ],
        'total'
      ) +

      selected.rows
        .map(row =>
          tr([
            esc(row.date),
            esc(row.ref),
            esc(row.description),
            cell(row.debit),
            cell(row.credit),
            pos(row.balance)
          ])
        )
        .join('') +

      tr(
        [
          '',
          '',
          '<b>Saldo akhir</b>',
          '',
          '',
          `<b>${pos(selected.closing)}</b>`
        ],
        'total'
      );


    return `
      <div class="acct-filter">
        <label for="acct-account">
          Pilih akun
        </label>

        <select id="acct-account">
          ${options}
        </select>
      </div>

      ${table(
        [
          'Tanggal',
          'Referensi',
          'Keterangan',
          'Debit',
          'Kredit',
          'Saldo'
        ],
        rows,
        6
      )}
    `;
  }


  /* =======================================================
     9. NERACA SALDO
     ======================================================= */

  function trial(data) {

    const rows =
      data.trial
        .map(account =>
          tr([
            esc(account.code),
            esc(account.name),
            cell(account.debit),
            cell(account.credit)
          ])
        )
        .join('') +

      tr(
        [
          '',
          '<b>Jumlah</b>',
          `<b>${rp(data.totalDebit)}</b>`,
          `<b>${rp(data.totalCredit)}</b>`
        ],
        'total'
      );


    const balanced =
      data.totalDebit ===
      data.totalCredit;


    return `
      ${table(
        [
          'Kode',
          'Nama akun',
          'Debit',
          'Kredit'
        ],
        rows,
        4
      )}

      <p class="sub">
        ${
          balanced
            ? '✓ Total debit dan kredit seimbang.'
            : '⚠ Total debit dan kredit tidak seimbang.'
        }

        Keseimbangan neraca saldo tidak menjamin
        seluruh transaksi sudah diklasifikasikan dengan benar.
      </p>
    `;
  }


  /* =======================================================
     10. WARNING
     ======================================================= */

  function warningBox(data) {

    if (!data.warnings.length) {
      return '';
    }


    return `
      <div class="notice">

        <b>
          ⚠ Periksa Data
        </b>

        <ul style="margin-bottom:0">

          ${data.warnings
            .slice(0, 5)
            .map(message =>
              `<li>${esc(message)}</li>`
            )
            .join('')}

        </ul>

        ${
          data.warnings.length > 5
            ? `
              <div class="sub">
                +${data.warnings.length - 5}
                peringatan lainnya.
              </div>
            `
            : ''
        }

      </div>
    `;
  }


  /* =======================================================
     11. JUDUL SECTION
     ======================================================= */

  function sectionTitle() {

    const titles = {
      ringkasan: 'Ringkasan Usaha',
      laba: 'Laba Rugi',
      kas: 'Arus Kas',
      jurnal: 'Jurnal Umum',
      buku: 'Buku Besar',
      neraca: 'Neraca Saldo'
    };


    return (
      titles[section] ||
      'Ringkasan Usaha'
    );
  }


  /* =======================================================
     12. CONTENT SECTION
     ======================================================= */

  function sectionContent(data) {

    const sections = {
      ringkasan: () =>
        summary(data),

      laba: () =>
        income(data),

      kas: () =>
        cashflow(data),

      jurnal: () =>
        journal(data),

      buku: () =>
        ledger(data),

      neraca: () =>
        trial(data)
    };


    const handler =
      sections[section] ||
      sections.ringkasan;


    return handler();
  }


  /* =======================================================
     13. RENDER UTAMA
     ======================================================= */

  function renderUI() {

    const data =
      Accounting.build(
        Array.isArray(S.tx)
          ? S.tx
          : [],
        month
      );


    return `
      <div class="acct-page">

        <div class="acct-head">

          <div>
            <h1 style="margin-bottom:4px">
              Laporan Usaha
            </h1>

            <div class="sub">
              Pantau kondisi keuangan Olikans secara otomatis
              dari transaksi yang sudah dicatat.
            </div>
          </div>

        </div>


        <div class="card acct-period-card">

          <div class="acct-period-row">

            <div>
              <label for="acct-month">
                Periode laporan
              </label>

              <input
                type="month"
                id="acct-month"
                value="${esc(data.period)}"
              >
            </div>


            <div class="acct-period-info">

              <div class="sub">
                Menampilkan laporan
              </div>

              <b>
                ${esc(periodName(data.period))}
              </b>

            </div>

          </div>

        </div>


        ${warningBox(data)}


        <div class="acct-tabs">

          ${btn(
            'ringkasan',
            'Ringkasan'
          )}

          ${btn(
            'laba',
            'Laba Rugi'
          )}

          ${btn(
            'kas',
            'Arus Kas'
          )}

        </div>


        <div class="acct-detail-label">
          <span>Detail Akuntansi</span>
        </div>


        <div class="acct-tabs acct-tabs-secondary">

          ${btn(
            'jurnal',
            'Jurnal'
          )}

          ${btn(
            'buku',
            'Buku Besar'
          )}

          ${btn(
            'neraca',
            'Neraca Saldo'
          )}

        </div>


        <div class="card acct-report-card">

          <div class="acct-report-heading">

            <div>

              <b>
                ${sectionTitle()}
              </b>

              <div class="sub">
                ${esc(periodName(data.period))}
              </div>

            </div>

          </div>


          ${sectionContent(data)}

        </div>


        <button
          type="button"
          class="btn"
          data-acct-export
        >
          ⬇ Ekspor Laporan ke Excel (.xlsx)
        </button>


        <div class="card acct-info-card">

          <b>
            Tentang laporan ini
          </b>

          <p class="sub">
            Laporan dibuat otomatis dari transaksi usaha.
            Penjualan berasal dari pesanan yang telah selesai,
            sedangkan pengeluaran, modal, pinjaman, dan
            pendapatan lain berasal dari pencatatan keuangan.
          </p>

          <p class="sub" style="margin-bottom:0">
            Laporan laba rugi masih bersifat indikatif karena
            sistem belum menghitung HPP aktual dan nilai
            persediaan akhir. Jurnal, buku besar, dan neraca
            saldo tersedia sebagai detail pembukuan.
          </p>

        </div>

      </div>
    `;
  }


  /* =======================================================
     14. PUBLIC API
     ======================================================= */

  return {

    render: renderUI,


    setSection(value) {

      const allowed = [
        'ringkasan',
        'laba',
        'kas',
        'jurnal',
        'buku',
        'neraca'
      ];


      if (allowed.includes(value)) {
        section = value;
      }
    },


    setMonth(value) {

      if (
        /^\d{4}-(0[1-9]|1[0-2])$/.test(
          String(value || '')
        )
      ) {
        month = value;
      }
    },


    setAccount(value) {

      if (
        Accounting.ACCOUNTS.some(
          account =>
            account.code === value
        )
      ) {
        code = value;
      }
    },


    export() {

      Accounting.exportExcel(
        Array.isArray(S.tx)
          ? S.tx
          : [],
        month
      );
    }
  };

})();


/* =========================================================
   15. EVENT — TAB LAPORAN
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const tab =
      event.target.closest(
        '[data-acct-tab]'
      );


    if (tab) {

      AUI.setSection(
        tab.dataset.acctTab
      );


      if (
        typeof render === 'function'
      ) {
        render();
      }

      return;
    }


    /* =====================================================
       EXPORT EXCEL
       ===================================================== */

    const exportButton =
      event.target.closest(
        '[data-acct-export]'
      );


    if (exportButton) {

      try {

        AUI.export();


        if (
          typeof toast === 'function'
        ) {
          toast(
            'Laporan Excel disiapkan.'
          );
        }

      } catch (error) {

        console.error(
          'Gagal mengekspor laporan:',
          error
        );


        if (
          typeof toast === 'function'
        ) {
          toast(
            error?.message ||
            'Gagal mengekspor laporan.'
          );
        }

      }
    }

  }
);


/* =========================================================
   16. EVENT — PERIODE & AKUN
   ========================================================= */

document.addEventListener(
  'change',
  event => {

    /* -----------------------------------------------------
       Periode
       ----------------------------------------------------- */

    if (
      event.target.id ===
      'acct-month'
    ) {

      AUI.setMonth(
        event.target.value
      );


      if (
        typeof render === 'function'
      ) {
        render();
      }

      return;
    }


    /* -----------------------------------------------------
       Buku Besar
       ----------------------------------------------------- */

    if (
      event.target.id ===
      'acct-account'
    ) {

      AUI.setAccount(
        event.target.value
      );


      if (
        typeof render === 'function'
      ) {
        render();
      }
    }

  }
);