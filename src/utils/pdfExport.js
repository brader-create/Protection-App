import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateAll } from './calculator';
import { WARRANTY_YEARS } from '../data/warrantyPricing';

const STRATEGIES = ['bestMix', 'singleBundle', 'individual'];
const STRATEGY_LABELS = {
  bestMix: 'Best Mix',
  singleBundle: 'Single Bundle',
  individual: 'Individual',
};

const PAGE_WIDTH = 210;
const A4_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
// Content stops this far above the bottom of the page, leaving room for the
// footer line.
const FOOTER_SPACE = 17;

// Sizes tried, largest first, until the page fits. 1 is the full-size layout;
// below the last the type gets too small to read comfortably.
const DENSITIES = [1, 0.93, 0.86, 0.8, 0.74, 0.68, 0.62, 0.57, 0.52, 0.48];

const COLOR = {
  ink: [30, 41, 59],
  muted: [100, 116, 139],
  faint: [148, 163, 184],
  heading: [51, 65, 85],
  banner: [15, 23, 42],
  totalRow: [241, 245, 249],
  breakdownHead: [226, 232, 240],
  best: [5, 150, 105],
  essentials: [180, 83, 9],
};

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Build the comparison PDF without saving it.
 *
 * It is always a single page. The layout is drawn on a tall scratch page to
 * measure it, and shrunk step by step until it fits an A4 page; a long
 * appliance list is split into two columns before the type gets small. Only
 * an order too big to fit even then gets one page taller than A4, so it still
 * never breaks across pages.
 *
 * `settings` says which sections to include (see utils/displaySettings), and
 * anything missing from it is included. `essentialAppliances` are the starred
 * models, printed as their own smaller recommendation when that's switched on.
 */
export function buildComparisonPDF(appliances, { settings = {}, essentialAppliances = [] } = {}) {
  const show = (key) => settings[key] !== false;
  const data = prepare(appliances, essentialAppliances, show);
  const { layout, height } = fitToOnePage(data, show);

  const fitsA4 = height <= A4_HEIGHT - FOOTER_SPACE;
  const pageHeight = fitsA4 ? A4_HEIGHT : Math.ceil(height + FOOTER_SPACE);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: fitsA4 ? 'a4' : [PAGE_WIDTH, pageHeight],
  });
  draw(doc, data, show, layout);

  return { doc, layout, pageHeight };
}

export function generateComparisonPDF(appliances, options) {
  buildComparisonPDF(appliances, options).doc.save('warranty-comparison.pdf');
}

function prepare(appliances, essentialAppliances, show) {
  const results = {};
  for (const yr of WARRANTY_YEARS) {
    results[yr] = calculateAll(appliances, yr);
  }

  let essentials = null;
  if (show('pdfEssentials') && essentialAppliances.length > 0) {
    const essentialResults = {};
    for (const yr of WARRANTY_YEARS) {
      essentialResults[yr] = calculateAll(essentialAppliances, yr);
    }
    essentials = { appliances: essentialAppliances, results: essentialResults };
  }

  return { appliances, results, essentials };
}

// The largest layout that fits an A4 page, and how tall it is.
function fitToOnePage(data, show) {
  const canSplit = show('pdfApplianceList') && data.appliances.length >= 6;
  // Stay in one column while the type is still near full size, then prefer
  // two columns at a larger size over one column at a smaller one.
  const attempts = canSplit
    ? [
        ...DENSITIES.filter((d) => d >= 0.8).map((density) => ({ density, splitAppliances: false })),
        ...DENSITIES.map((density) => ({ density, splitAppliances: true })),
      ]
    : DENSITIES.map((density) => ({ density, splitAppliances: false }));

  const limit = A4_HEIGHT - FOOTER_SPACE;
  let height = 0;
  for (const layout of attempts) {
    height = measure(data, show, layout);
    if (height <= limit) return { layout, height };
  }
  return { layout: attempts[attempts.length - 1], height };
}

function measure(data, show, layout) {
  // Tall enough that nothing paginates, so the result is the true height.
  const scratch = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH, 3000] });
  return draw(scratch, data, show, layout);
}

function metricsFor(d) {
  return {
    headerHeight: 38 * Math.max(0.7, d),
    titleFont: 18 * Math.max(0.75, d),
    subtitleFont: 10 * Math.max(0.75, d),
    sectionFont: Math.max(7, 11 * d),
    noteFont: Math.max(5.5, 8 * d),
    tableFont: 8.5 * d,
    tableHeadFont: 8 * d,
    tablePadding: Math.max(0.6, 2 * d),
    comparisonFont: 9 * d,
    comparisonPadding: Math.max(0.8, 3 * d),
    sectionGap: 8 * d,
    breakdownHeadHeight: 7 * d,
    breakdownHeadFont: 7.5 * d,
    breakdownFont: 6.5 * d,
    breakdownGroupLine: 3.5 * d,
    breakdownLine: 3 * d,
    breakdownGroupGap: 1 * d,
  };
}

// Draw a table and return where it ends.
function table(doc, options) {
  const result = autoTable(doc, options);
  return result?.finalY ?? doc.lastAutoTable?.finalY ?? options.startY;
}

function sectionTitle(doc, m, title, y, note) {
  doc.setTextColor(...COLOR.ink);
  doc.setFontSize(m.sectionFont);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN, y);
  if (note) {
    const width = doc.getTextWidth(title);
    doc.setFontSize(m.noteFont);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.muted);
    doc.text(note, MARGIN + width + 3, y);
  }
  return y + 2;
}

function applianceTable(doc, m, { startY, rows, left, width, withTotalRow, headColor }) {
  return table(doc, {
    startY,
    head: [['#', 'Model / Description', 'Cost']],
    body: rows,
    margin: { left, right: PAGE_WIDTH - left - width },
    tableWidth: width,
    styles: { fontSize: m.tableFont, cellPadding: m.tablePadding, textColor: COLOR.ink },
    headStyles: { fillColor: headColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.tableHeadFont },
    columnStyles: {
      0: { cellWidth: 10 * Math.max(0.7, m.tableFont / 8.5), halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30 * Math.max(0.75, m.tableFont / 8.5), halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (cell) => {
      if (withTotalRow && cell.section === 'body' && cell.row.index === rows.length - 1) {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = COLOR.totalRow;
      }
    },
  });
}

/**
 * Draw the whole page and return where the content ends. Used both for the
 * real page and for measuring on a scratch one.
 */
function draw(doc, data, show, { density, splitAppliances }) {
  const m = metricsFor(density);
  const pageHeight = doc.internal.pageSize.getHeight();
  const { appliances, results, essentials } = data;

  // --- Header ---
  doc.setFillColor(...COLOR.banner);
  doc.rect(0, 0, PAGE_WIDTH, m.headerHeight, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(m.titleFont);
  doc.setFont('helvetica', 'bold');
  doc.text('Warranty Protection Plan', MARGIN, m.headerHeight * 0.47);

  doc.setFontSize(m.subtitleFont);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.faint);
  doc.text('Pricing Comparison', MARGIN, m.headerHeight * 0.684);

  if (show('pdfDate')) {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(today, PAGE_WIDTH - MARGIN, m.headerHeight * 0.684, { align: 'right' });
  }

  let y = m.headerHeight + 8 * density;

  // --- Appliances covered ---
  if (show('pdfApplianceList')) {
    y = sectionTitle(doc, m, 'Appliances Covered', y);

    const rows = appliances.map((app, i) => [(i + 1).toString(), app.model, formatPrice(app.cost)]);
    const total = ['', 'Total', formatPrice(appliances.reduce((sum, a) => sum + a.cost, 0))];
    const withTotal = show('pdfApplianceTotal');

    if (splitAppliances) {
      const gap = 4;
      const width = (CONTENT_WIDTH - gap) / 2;
      const half = Math.ceil(rows.length / 2);
      const rightRows = withTotal ? [...rows.slice(half), total] : rows.slice(half);
      const leftEnd = applianceTable(doc, m, {
        startY: y, rows: rows.slice(0, half), left: MARGIN, width, withTotalRow: false, headColor: COLOR.heading,
      });
      const rightEnd = applianceTable(doc, m, {
        startY: y, rows: rightRows, left: MARGIN + width + gap, width, withTotalRow: withTotal, headColor: COLOR.heading,
      });
      y = Math.max(leftEnd, rightEnd);
    } else {
      y = applianceTable(doc, m, {
        startY: y,
        rows: withTotal ? [...rows, total] : rows,
        left: MARGIN,
        width: CONTENT_WIDTH,
        withTotalRow: withTotal,
        headColor: COLOR.heading,
      });
    }
    y += m.sectionGap + 2 * density;
  }

  // Cheapest total per term, to highlight in the comparison table.
  const bestPerYear = {};
  for (const yr of WARRANTY_YEARS) {
    let best = null;
    for (const key of STRATEGIES) {
      const r = results[yr]?.[key];
      if (r?.valid && (best === null || r.total < best)) best = r.total;
    }
    bestPerYear[yr] = best;
  }

  // --- Pricing comparison ---
  if (show('pdfComparisonTable')) {
    y = sectionTitle(doc, m, 'Pricing Comparison', y);

    const rows = STRATEGIES.map((key) => [
      STRATEGY_LABELS[key],
      ...WARRANTY_YEARS.map((yr) => {
        const r = results[yr]?.[key];
        return r?.valid ? formatPrice(r.total) : '—';
      }),
    ]);

    y = table(doc, {
      startY: y,
      head: [['Strategy', ...WARRANTY_YEARS.map((yr) => `${yr}-Year`)]],
      body: rows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: m.comparisonFont, cellPadding: m.comparisonPadding, textColor: COLOR.ink },
      headStyles: { fillColor: COLOR.heading, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.comparisonFont },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      didParseCell: (cell) => {
        if (cell.section !== 'body' || cell.column.index === 0) return;
        const yr = WARRANTY_YEARS[cell.column.index - 1];
        const r = results[yr]?.[STRATEGIES[cell.row.index]];
        if (r?.valid && bestPerYear[yr] !== null && r.total === bestPerYear[yr]) {
          cell.cell.styles.textColor = COLOR.best;
          cell.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y += m.sectionGap;
  }

  // --- Best option breakdown: the cheapest option per term, side by side ---
  if (show('pdfBreakdown')) {
    doc.setTextColor(...COLOR.ink);
    doc.setFontSize(Math.max(7, 10 * density));
    doc.setFont('helvetica', 'bold');
    doc.text('Best Option Breakdown', MARGIN, y);
    y += 5 * density;

    const colWidth = (CONTENT_WIDTH - 6) / 3;
    const top = y;
    let bottom = top;

    WARRANTY_YEARS.forEach((yr, col) => {
      const result = results[yr];
      const bestKey = STRATEGIES.find((key) => result?.[key]?.valid && result[key].total === bestPerYear[yr]);
      if (!bestKey) return;

      const x = MARGIN + col * (colWidth + 3);
      let cy = top;

      doc.setFillColor(...COLOR.breakdownHead);
      doc.rect(x, cy, colWidth, m.breakdownHeadHeight, 'F');
      doc.setFontSize(m.breakdownHeadFont);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR.heading);
      doc.text(
        `${yr}-Year: ${STRATEGY_LABELS[bestKey]} — ${formatPrice(bestPerYear[yr])}`,
        x + 2,
        cy + m.breakdownHeadHeight * 0.71,
      );
      cy += m.breakdownHeadHeight + 3.2 * density;

      doc.setFontSize(m.breakdownFont);
      for (const item of result[bestKey].items) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLOR.heading);
        doc.text(item.groupLabel, x + 1, cy);
        doc.text(formatPrice(item.price), x + colWidth - 1, cy, { align: 'right' });
        cy += m.breakdownGroupLine;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLOR.muted);
        for (const app of item.appliances) {
          const label = app.model.length > 18 ? app.model.substring(0, 18) + '...' : app.model;
          doc.text(label, x + 2, cy);
          cy += m.breakdownLine;
        }
        cy += m.breakdownGroupGap;
      }
      bottom = Math.max(bottom, cy);
    });

    y = bottom + m.sectionGap;
  }

  // --- Essentials: the starred models priced on their own ---
  if (essentials) {
    y = sectionTitle(doc, m, 'Essentials', y, 'Selected models covered on their own');

    // Models on the left, their plan price per term on the right.
    const gap = 4;
    const leftWidth = (CONTENT_WIDTH - gap) * 0.58;
    const rightWidth = CONTENT_WIDTH - gap - leftWidth;
    const withTotal = show('pdfApplianceTotal');

    const rows = essentials.appliances.map((app, i) => [(i + 1).toString(), app.model, formatPrice(app.cost)]);
    if (withTotal) {
      rows.push(['', 'Total', formatPrice(essentials.appliances.reduce((sum, a) => sum + a.cost, 0))]);
    }

    const leftEnd = applianceTable(doc, m, {
      startY: y, rows, left: MARGIN, width: leftWidth, withTotalRow: withTotal, headColor: COLOR.essentials,
    });

    const priceRows = WARRANTY_YEARS.map((yr) => {
      const r = essentials.results[yr];
      const bestKey = STRATEGIES.find((key) => r?.[key]?.valid && r[key].total === r.cheapestPrice);
      return [`${yr}-Year`, bestKey ? STRATEGY_LABELS[bestKey] : '—', r?.cheapestPrice != null ? formatPrice(r.cheapestPrice) : '—'];
    });

    const rightEnd = table(doc, {
      startY: y,
      head: [['Term', 'Option', 'Plan']],
      body: priceRows,
      margin: { left: MARGIN + leftWidth + gap, right: MARGIN },
      tableWidth: rightWidth,
      styles: { fontSize: m.tableFont, cellPadding: m.tablePadding, textColor: COLOR.ink },
      headStyles: { fillColor: COLOR.essentials, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.tableHeadFont },
      columnStyles: {
        0: { fontStyle: 'bold' },
        2: { halign: 'right', fontStyle: 'bold' },
      },
    });

    y = Math.max(leftEnd, rightEnd) + m.sectionGap;
  }

  // The last section's trailing gap isn't content.
  const contentBottom = y - m.sectionGap;

  // --- Footer ---
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.faint);
  doc.text('Warranty List Options 6.0 — Protection Plan Calculator', PAGE_WIDTH / 2, pageHeight - 10, { align: 'center' });

  return contentBottom;
}
