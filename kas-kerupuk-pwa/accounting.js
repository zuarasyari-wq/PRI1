/* =========================================================
   OLIKANS ACCOUNTING v2.2
   Mesin pembukuan otomatis berbasis transaksi
   =========================================================

   Prinsip:
   - Penjualan berasal dari transaksi otomatis Pesanan.
   - Pengeluaran berasal dari menu Keuangan.
   - Modal, pinjaman, dan pendapatan lain dipisahkan.
   - Penjualan belum lunas dicatat sebagai Piutang Usaha.
   - Pelunasan piutang memindahkan Piutang -> Kas.
   - Jurnal/laporan adalah laporan turunan, bukan jurnal
     permanen yang diposting ke database.
   - HPP aktual dan nilai persediaan belum dihitung.

   Mata uang: IDR
   ========================================================= */

(function (root) {
  'use strict';

  /* =======================================================
     1. DAFTAR AKUN
     ======================================================= */

  const ACCOUNTS = [
    {
      code: '101',
      name: 'Kas',
      normal: 'D',
      kind: 'asset'
    },
    {
      code: '102',
      name: 'Piutang Usaha',
      normal: 'D',
      kind: 'asset'
    },

    {
      code: '201',
      name: 'Utang Pinjaman',
      normal: 'K',
      kind: 'liability'
    },

    {
      code: '301',
      name: 'Modal Pemilik',
      normal: 'K',
      kind: 'equity'
    },

    {
      code: '401',
      name: 'Penjualan',
      normal: 'K',
      kind: 'revenue'
    },
    {
      code: '402',
      name: 'Pendapatan Lain',
      normal: 'K',
      kind: 'revenue'
    },

    {
      code: '501',
      name: 'Beban Bahan Baku',
      normal: 'D',
      kind: 'expense'
    },
    {
      code: '502',
      name: 'Beban Kemasan',
      normal: 'D',
      kind: 'expense'
    },
    {
      code: '503',
      name: 'Beban Gas & Listrik',
      normal: 'D',
      kind: 'expense'
    },
    {
      code: '504',
      name: 'Beban Upah',
      normal: 'D',
      kind: 'expense'
    },
    {
      code: '505',
      name: 'Beban Transportasi',
      normal: 'D',
      kind: 'expense'
    },
    {
      code: '506',
      name: 'Beban Lain-lain',
      normal: 'D',
      kind: 'expense'
    }
  ];

  const MAP = Object.fromEntries(
    ACCOUNTS.map(account => [account.code, account])
  );


  /* =======================================================
     2. PEMETAAN KATEGORI PENGELUARAN
     ======================================================= */

  const CATOUT = {
    'bahan baku': '501',
    'kemasan': '502',
    'gas & listrik': '503',
    'gas dan listrik': '503',
    'listrik & gas': '503',
    'listrik dan gas': '503',
    'upah': '504',
    'transport': '505',
    'transportasi': '505',
    'lain-lain': '506',
    'lain lain': '506'
  };


  /* =======================================================
     3. HELPER
     ======================================================= */

  const amount = value => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.round(number);
  };


  const normalizeText = value => {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
  };


  const normalizeCategory = value => {
    return normalizeText(value).toLowerCase();
  };


  const normalizeDateKey = value => {
    if (value instanceof Date) {
      const date = new Date(value.getTime());

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');
    }

    if (value === null || value === undefined) {
      return '';
    }

    const text = String(value).trim();

    if (!text) {
      return '';
    }

    const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (direct) {
      const date = new Date(text + 'T00:00:00');

      if (!Number.isNaN(date.getTime())) {
        return text;
      }
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  };


  const isDate = value => {
    return !!normalizeDateKey(value);
  };


  const money = value => {
    const number = amount(value);

    return (
      (number < 0 ? '-' : '') +
      'Rp ' +
      Math.abs(number).toLocaleString('id-ID')
    );
  };


  const escape = value => {
    return String(value ?? '').replace(
      /[&<>"'`]/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;'
      })[character]
    );
  };


  const periodRange = period => {
    let selected = String(period || '').trim();

    if (period instanceof Date) {
      const normalized = normalizeDateKey(period);

      if (normalized) {
        selected = normalized.slice(0, 7);
      }
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) {
      const today = new Date();

      selected =
        today.getFullYear() +
        '-' +
        String(today.getMonth() + 1).padStart(2, '0');
    }

    const [year, month] = selected
      .split('-')
      .map(Number);

    const lastDay = new Date(
      year,
      month,
      0
    ).getDate();

    return {
      period: selected,
      start: selected + '-01',
      end:
        selected +
        '-' +
        String(lastDay).padStart(2, '0')
    };
  };


  /* =======================================================
     4. KONVERSI TRANSAKSI MENJADI JURNAL
     ======================================================= */

  function prepare(transactions) {
    const entries = [];
    const warnings = [];

    let sequence = 0;


    function addEntry(
      date,
      ref,
      description,
      debitAccount,
      creditAccount,
      value,
      flow = null
    ) {
      const n = amount(value);

      if (n <= 0) {
        return;
      }

      sequence += 1;

      entries.push({
        id: ref + '-' + sequence,
        date,
        ref,
        description,
        flow,

        lines: [
          {
            account: debitAccount,
            debit: n,
            credit: 0
          },
          {
            account: creditAccount,
            debit: 0,
            credit: n
          }
        ]
      });
    }


    (Array.isArray(transactions) ? transactions : [])
      .forEach((transaction, index) => {

        if (!transaction) {
          warnings.push(
            'Transaksi #' +
            (index + 1) +
            ' diabaikan karena data kosong.'
          );

          return;
        }


        const date = normalizeDateKey(transaction.date) || '';
        const type = String(transaction.type || '');
        const value = amount(transaction.amt);


        /* -----------------------------------------------
           Validasi dasar
           ----------------------------------------------- */

        if (!isDate(date)) {
          warnings.push(
            'Transaksi #' +
            (index + 1) +
            ' diabaikan karena tanggal tidak valid.'
          );

          return;
        }


        if (!['in', 'out'].includes(type)) {
          warnings.push(
            'Transaksi #' +
            (index + 1) +
            ' diabaikan karena jenis transaksi tidak valid.'
          );

          return;
        }


        if (
          !Number.isFinite(Number(transaction.amt)) ||
          value <= 0
        ) {
          warnings.push(
            'Transaksi #' +
            (index + 1) +
            ' diabaikan karena nominal harus lebih dari Rp 0.'
          );

          return;
        }


        const category = normalizeText(transaction.cat);
        const normalizedCategory =
          normalizeCategory(transaction.cat);

        const ref =
          'TX-' +
          String(
            transaction.id ??
            (index + 1)
          );


        const description =
          normalizeText(
            transaction.note ||
            transaction.who ||
            category ||
            'Transaksi'
          );


        /* =================================================
           UANG KELUAR
           ================================================= */

        if (type === 'out') {

          const expenseAccount =
            CATOUT[normalizedCategory] ||
            '506';


          addEntry(
            date,
            ref,
            description,
            expenseAccount,
            '101',
            value,
            'operating'
          );

          return;
        }


        /* =================================================
           UANG MASUK
           ================================================= */

        let creditAccount = '401';
        let flow = 'operating';


        /* -----------------------------------------------
           Modal pemilik
           ----------------------------------------------- */

        if (
          normalizedCategory === 'setoran modal' ||
          normalizedCategory === 'modal' ||
          normalizedCategory === 'modal pemilik'
        ) {
          creditAccount = '301';
          flow = 'financing';
        }


        /* -----------------------------------------------
           Pinjaman diterima
           ----------------------------------------------- */

        else if (
          normalizedCategory === 'pinjaman diterima' ||
          normalizedCategory === 'pinjaman'
        ) {
          creditAccount = '201';
          flow = 'financing';
        }


        /* -----------------------------------------------
           Pendapatan lain
           ----------------------------------------------- */

        else if (
          normalizedCategory === 'pendapatan lain' ||
          normalizedCategory === 'pendapatan lainnya' ||
          normalizedCategory === 'lain-lain' ||
          normalizedCategory === 'lain lain'
        ) {
          creditAccount = '402';
          flow = 'operating';
        }


        /* -----------------------------------------------
           Selain penjualan harus berupa uang yang
           benar-benar sudah diterima.
           ----------------------------------------------- */

        if (
          creditAccount !== '401' &&
          transaction.paid === false
        ) {
          warnings.push(
            ref +
            ' belum lunas tetapi bukan transaksi penjualan. ' +
            'Transaksi belum dimasukkan ke laporan sampai diterima.'
          );

          return;
        }


        /* =================================================
           PENJUALAN
           ================================================= */

        if (creditAccount === '401') {

          /*
           * Kompatibilitas data lama:
           *
           * paid hanya dianggap BELUM LUNAS jika nilainya
           * benar-benar false.
           *
           * Jika field paid tidak tersedia pada transaksi lama,
           * transaksi dianggap lunas.
           */

          const isPaid =
            transaction.paid !== false;


          /* ---------------------------------------------
             Penjualan belum lunas
             Piutang Usaha -> Penjualan
             --------------------------------------------- */

          if (!isPaid) {

            addEntry(
              date,
              ref,
              description,
              '102',
              '401',
              value,
              null
            );

            return;
          }


          /*
           * Jika transaksi sudah lunas:
           *
           * - paid_at > tanggal penjualan:
           *   buat piutang dahulu kemudian pelunasan.
           *
           * - paid_at kosong / sama / sebelum tanggal:
           *   dianggap tunai pada tanggal transaksi.
           */

          const paidAt =
            normalizeDateKey(transaction.paid_at) || date;


          if (
            transaction.paid_at &&
            !isDate(transaction.paid_at)
          ) {

            warnings.push(
              ref +
              ' memiliki tanggal pelunasan tidak valid. ' +
              'Transaksi dianggap lunas pada tanggal penjualan.'
            );


            addEntry(
              date,
              ref,
              description,
              '101',
              '401',
              value,
              'operating'
            );

            return;
          }


          if (paidAt > date) {

            /* Penjualan kredit */

            addEntry(
              date,
              ref,
              description,
              '102',
              '401',
              value,
              null
            );


            /* Pelunasan */

            addEntry(
              paidAt,
              ref,
              'Pelunasan piutang: ' + description,
              '101',
              '102',
              value,
              'operating'
            );


            return;
          }


          /* Penjualan tunai */

          addEntry(
            date,
            ref,
            description,
            '101',
            '401',
            value,
            'operating'
          );

          return;
        }


        /* =================================================
           MODAL / PINJAMAN / PENDAPATAN LAIN
           ================================================= */

        addEntry(
          date,
          ref,
          description,
          '101',
          creditAccount,
          value,
          flow
        );
      });


    /* =====================================================
       URUTKAN JURNAL
       ===================================================== */

    entries.sort((a, b) => {
      return (
        a.date.localeCompare(b.date) ||
        a.ref.localeCompare(b.ref) ||
        a.id.localeCompare(b.id)
      );
    });


    return {
      entries,
      warnings
    };
  }


  /* =======================================================
     5. HITUNG SALDO AKUN
     ======================================================= */

  function signed(entries, until, accountCode) {
    let balance = 0;

    entries.forEach(entry => {

      if (entry.date > until) {
        return;
      }

      entry.lines.forEach(line => {

        if (line.account === accountCode) {
          balance +=
            amount(line.debit) -
            amount(line.credit);
        }

      });

    });

    return amount(balance);
  }


  /* =======================================================
     6. MEMBANGUN LAPORAN
     ======================================================= */

  function build(transactions, period) {

    const range = periodRange(period);

    const start = range.start;
    const end = range.end;
    const selectedPeriod = range.period;


    const prepared =
      prepare(transactions);


    const entries =
      prepared.entries;


    const warnings =
      [...prepared.warnings];


    /* =====================================================
       JURNAL PERIODE
       ===================================================== */

    const journal = entries.filter(entry =>
      entry.date >= start &&
      entry.date <= end
    );


    /* =====================================================
       BUKU BESAR
       ===================================================== */

    const ledger = {};


    ACCOUNTS.forEach(account => {

      let opening = 0;


      entries.forEach(entry => {

        if (entry.date >= start) {
          return;
        }


        entry.lines.forEach(line => {

          if (line.account === account.code) {
            opening +=
              amount(line.debit) -
              amount(line.credit);
          }

        });

      });


      opening = amount(opening);


      let balance = opening;

      const rows = [];


      journal.forEach(entry => {

        entry.lines.forEach(line => {

          if (line.account !== account.code) {
            return;
          }


          balance +=
            amount(line.debit) -
            amount(line.credit);


          rows.push({
            date: entry.date,
            ref: entry.ref,
            description: entry.description,
            debit: amount(line.debit),
            credit: amount(line.credit),
            balance: amount(balance)
          });

        });

      });


      ledger[account.code] = {
        account,
        opening,
        rows,
        closing: amount(balance)
      };
    });


    /* =====================================================
       NERACA SALDO
       ===================================================== */

    const trial = ACCOUNTS
      .map(account => {

        const balance =
          signed(
            entries,
            end,
            account.code
          );


        return {
          ...account,
          debit: Math.max(balance, 0),
          credit: Math.max(-balance, 0)
        };

      })
      .filter(row =>
        row.debit ||
        row.credit
      );


    const totalDebit =
      amount(
        trial.reduce(
          (sum, row) =>
            sum + amount(row.debit),
          0
        )
      );


    const totalCredit =
      amount(
        trial.reduce(
          (sum, row) =>
            sum + amount(row.credit),
          0
        )
      );


    /* =====================================================
       LABA RUGI INDIKATIF
       ===================================================== */

    /*
     * Akun pendapatan normalnya kredit.
     * Saldo internal dihitung Debit - Kredit.
     *
     * Maka pendapatan periode:
     *
     * saldo awal - saldo akhir
     */

    const revenueItems =
      ACCOUNTS
        .filter(account =>
          account.kind === 'revenue'
        )
        .map(account => {

          const ledgerAccount =
            ledger[account.code];


          const value =
            amount(
              ledgerAccount.opening -
              ledgerAccount.closing
            );


          return {
            code: account.code,
            name: account.name,
            amount: value
          };
        });


    const revenue =
      amount(
        revenueItems.reduce(
          (sum, item) =>
            sum + item.amount,
          0
        )
      );


    /* =====================================================
       BEBAN PERIODE
       ===================================================== */

    const expenseItems =
      ACCOUNTS
        .filter(account =>
          account.kind === 'expense'
        )
        .map(account => {

          const ledgerAccount =
            ledger[account.code];


          const value =
            amount(
              ledgerAccount.closing -
              ledgerAccount.opening
            );


          return {
            code: account.code,
            name: account.name,
            amount: value
          };
        });


    const expenses =
      amount(
        expenseItems.reduce(
          (sum, item) =>
            sum + item.amount,
          0
        )
      );


    const profit =
      amount(
        revenue -
        expenses
      );


    const income = {
      revenue,
      revenueItems,
      expenses,
      expenseItems,
      profit,

      /*
       * Penting:
       * laba masih indikatif karena belum ada
       * perhitungan HPP aktual dan persediaan akhir.
       */
      isProvisional: true
    };


    /* =====================================================
       ARUS KAS
       ===================================================== */

    const openingCash =
      ledger['101'].opening;


    const cashEvents = [];


    journal.forEach(entry => {

      const cashLine =
        entry.lines.find(
          line =>
            line.account === '101'
        );


      if (!cashLine) {
        return;
      }


      const otherLine =
        entry.lines.find(
          line =>
            line.account !== '101'
        );


      let kind = 'operating';


      if (
        otherLine &&
        ['201', '301'].includes(
          otherLine.account
        )
      ) {
        kind = 'financing';
      }


      cashEvents.push({
        date: entry.date,
        ref: entry.ref,
        description: entry.description,
        kind,
        amount: amount(
          cashLine.debit -
          cashLine.credit
        )
      });
    });


    const operating =
      amount(
        cashEvents
          .filter(event =>
            event.kind === 'operating'
          )
          .reduce(
            (sum, event) =>
              sum + event.amount,
            0
          )
      );


    const financing =
      amount(
        cashEvents
          .filter(event =>
            event.kind === 'financing'
          )
          .reduce(
            (sum, event) =>
              sum + event.amount,
            0
          )
      );


    /*
     * Saat ini Olikans belum memiliki
     * kategori transaksi investasi.
     */
    const investing = 0;


    const net =
      amount(
        operating +
        investing +
        financing
      );


    const closingCash =
      amount(
        openingCash +
        net
      );


    const cashflow = {
      opening: openingCash,
      events: cashEvents,
      operating,
      investing,
      financing,
      net,
      closing: closingCash
    };


    /* =====================================================
       VALIDASI LAPORAN
       ===================================================== */

    if (
      cashflow.closing !==
      ledger['101'].closing
    ) {
      warnings.push(
        'Rekonsiliasi kas tidak sesuai. Periksa data transaksi.'
      );
    }


    if (cashflow.closing < 0) {
      warnings.push(
        'Saldo kas negatif. Periksa modal awal, transaksi keluar, atau transaksi yang belum dicatat.'
      );
    }


    if (totalDebit !== totalCredit) {
      warnings.push(
        'Neraca saldo tidak seimbang. Periksa jurnal transaksi.'
      );
    }


    return {
      start,
      end,
      period: selectedPeriod,

      accounts: ACCOUNTS,

      entries,
      journal,
      ledger,

      trial,
      totalDebit,
      totalCredit,

      income,
      cashflow,

      warnings
    };
  }


  /* =======================================================
     7. DATA BARIS JURNAL UNTUK EXCEL
     ======================================================= */

  const lineRows = data => {

    return data.journal.flatMap(entry =>

      entry.lines.map(line => {

        const account =
          MAP[line.account];


        return [
          entry.date,
          entry.ref,
          entry.description,

          line.account +
          ' ' +
          (account
            ? account.name
            : 'Akun'),

          line.debit || null,
          line.credit || null
        ];

      })

    );
  };


  /* =======================================================
     8. EXPORT EXCEL
     ======================================================= */

  function exportExcel(transactions, period) {

    if (!root.XLSX) {
      throw new Error(
        'Library ekspor Excel belum termuat. Pastikan perangkat terhubung internet lalu coba kembali.'
      );
    }


    const data =
      build(
        transactions,
        period
      );


    const workbook =
      root.XLSX.utils.book_new();


    function sheet(
      name,
      rows,
      widths,
      moneyColumns
    ) {

      const worksheet =
        root.XLSX.utils.aoa_to_sheet(
          rows
        );


      worksheet['!cols'] =
        widths.map(width => ({
          wch: width
        }));


      Object.keys(worksheet)
        .forEach(key => {

          if (key[0] === '!') {
            return;
          }


          const cell =
            worksheet[key];


          const position =
            root.XLSX.utils.decode_cell(
              key
            );


          if (
            moneyColumns.includes(
              position.c
            ) &&
            cell.t === 'n'
          ) {
            cell.z =
              '"Rp" #,##0;[Red]\\("Rp" #,##0\\)';
          }

        });


      root.XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        name
      );
    }


    /* =====================================================
       JURNAL UMUM
       ===================================================== */

    sheet(
      'Jurnal Umum',
      [
        [
          'Jurnal Umum — ' +
          data.period
        ],

        [
          'Tanggal',
          'Ref',
          'Keterangan',
          'Akun',
          'Debit',
          'Kredit'
        ],

        ...lineRows(data)
      ],

      [
        14,
        21,
        42,
        31,
        20,
        20
      ],

      [4, 5]
    );


    /* =====================================================
       BUKU BESAR
       ===================================================== */

    const ledgerRows = [
      [
        'Buku Besar — ' +
        data.period
      ],

      [
        'Akun',
        'Tanggal',
        'Ref',
        'Keterangan',
        'Debit',
        'Kredit',
        'Saldo Absolut',
        'Posisi'
      ]
    ];


    Object.values(data.ledger)
      .forEach(item => {

        if (
          !item.rows.length &&
          !item.opening
        ) {
          return;
        }


        ledgerRows.push([
          item.account.code +
          ' ' +
          item.account.name,

          'Saldo awal',

          null,
          null,
          null,
          null,

          Math.abs(
            item.opening
          ),

          item.opening >= 0
            ? 'Debit'
            : 'Kredit'
        ]);


        item.rows.forEach(row => {

          ledgerRows.push([
            item.account.code +
            ' ' +
            item.account.name,

            row.date,
            row.ref,
            row.description,

            row.debit || null,
            row.credit || null,

            Math.abs(
              row.balance
            ),

            row.balance >= 0
              ? 'Debit'
              : 'Kredit'
          ]);

        });

      });


    sheet(
      'Buku Besar',
      ledgerRows,

      [
        30,
        14,
        22,
        42,
        20,
        20,
        23,
        13
      ],

      [4, 5, 6]
    );


    /* =====================================================
       NERACA SALDO
       ===================================================== */

    sheet(
      'Neraca Saldo',

      [
        [
          'Neraca Saldo per ' +
          data.end
        ],

        [
          'Kode Akun',
          'Nama Akun',
          'Debit',
          'Kredit'
        ],

        ...data.trial.map(row => [
          row.code,
          row.name,
          row.debit || null,
          row.credit || null
        ]),

        [
          '',
          'TOTAL',
          data.totalDebit,
          data.totalCredit
        ]
      ],

      [
        17,
        34,
        22,
        22
      ],

      [2, 3]
    );


    /* =====================================================
       LABA RUGI
       ===================================================== */

    const incomeRows = [
      [
        'Laba Rugi Indikatif — ' +
        data.period
      ],

      [
        'Keterangan',
        'Nilai'
      ]
    ];


    data.income.revenueItems
      .filter(item => item.amount)
      .forEach(item => {

        incomeRows.push([
          item.name,
          item.amount
        ]);

      });


    incomeRows.push([
      'Total Pendapatan',
      data.income.revenue
    ]);


    data.income.expenseItems
      .filter(item => item.amount)
      .forEach(item => {

        incomeRows.push([
          item.name,
          -item.amount
        ]);

      });


    incomeRows.push([
      'Total Beban',
      -data.income.expenses
    ]);


    incomeRows.push([
      'Surplus / (Defisit) Indikatif',
      data.income.profit
    ]);


    incomeRows.push([
      'Catatan: laba masih indikatif karena HPP aktual dan nilai persediaan akhir belum dihitung.'
    ]);


    sheet(
      'Laba Rugi',

      incomeRows,

      [
        90,
        24
      ],

      [1]
    );


    /* =====================================================
       ARUS KAS
       ===================================================== */

    sheet(
      'Arus Kas',

      [
        [
          'Arus Kas — ' +
          data.period
        ],

        [
          'Keterangan',
          'Nilai'
        ],

        [
          'Kas awal',
          data.cashflow.opening
        ],

        [
          'Operasi',
          data.cashflow.operating
        ],

        [
          'Investasi',
          data.cashflow.investing
        ],

        [
          'Pendanaan',
          data.cashflow.financing
        ],

        [
          'Perubahan kas',
          data.cashflow.net
        ],

        [
          'Kas akhir',
          data.cashflow.closing
        ],

        [],

        [
          'Tanggal',
          'Ref',
          'Keterangan',
          'Kelompok',
          'Arus kas'
        ],

        ...data.cashflow.events.map(
          event => [
            event.date,
            event.ref,
            event.description,
            event.kind === 'financing'
              ? 'Pendanaan'
              : 'Operasi',
            event.amount
          ]
        )
      ],

      [
        24,
        28,
        44,
        19,
        21
      ],

      [1, 4]
    );


    /* =====================================================
       SIMPAN FILE
       ===================================================== */

    root.XLSX.writeFile(
      workbook,
      'Laporan-Olikans-' +
      data.period +
      '.xlsx'
    );
  }


  /* =======================================================
     9. RIWAYAT KAS
     ======================================================= */

  function cashHistory(transactions) {

    const prepared =
      prepare(transactions);


    return prepared.entries
      .flatMap(entry => {

        const cash =
          entry.lines.find(
            line =>
              line.account === '101'
          );


        if (!cash) {
          return [];
        }


        return [{
          date: entry.date,

          amt: amount(
            cash.debit -
            cash.credit
          )
        }];

      });
  }


  /* =======================================================
     10. PUBLIC API
     ======================================================= */

  root.Accounting = {

    ACCOUNTS,

    build,

    exportExcel,

    cashHistory,

    money,

    escape,

    periodRange
  };

})(
  typeof window === 'undefined'
    ? globalThis
    : window
);