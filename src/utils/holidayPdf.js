import { jsPDF } from 'jspdf';
import {
  PAGE_WIDTH,
  A4_HEIGHT,
  MARGIN,
  CONTENT_WIDTH,
  FOOTER_SPACE,
  DENSITIES,
  COLOR,
  formatPrice,
  metricsFor,
  lineHeight,
  table,
  sectionTitle,
} from './pdfExport';
import { PROMO_YEARS, PROMO_BADGES, calculateHolidayTerm } from './holidayPromo';

// The Christmas print-off: its own one-page sheet, separate from the regular
// comparison PDF. It lists the models with their holiday offer, the price per
// term, and for each term the full split — what's covered free, the best
// bundle for the rest, and the 20% rebate as its own line.

const XMAS = {
  red: [185, 28, 28],
  deepRed: [127, 29, 29],
  green: [21, 128, 61],
  deepGreen: [20, 83, 45],
  gold: [202, 138, 4],
  paleRed: [254, 242, 242],
  paleGreen: [240, 253, 244],
  trunk: [120, 53, 15],
};

const termLabel = (yr) => `${yr}-Year Additional`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Build the Christmas PDF without saving it.
 * @param {Array} appliances - The models as priced (with any Save 3% applied).
 * @param {Object} promo - Free additional years by appliance id.
 * @param {Object} [terms] - calculateHolidayTerm results by term, when already
 *   worked out; any missing term is worked out here.
 */
export function buildHolidayPDF(appliances, promo, terms = {}) {
  const data = {
    appliances,
    promo,
    applianceCost: appliances.reduce((sum, a) => sum + a.cost, 0),
    terms: Object.fromEntries(PROMO_YEARS.map((yr) => [yr, terms[yr] ?? calculateHolidayTerm(appliances, promo, yr)])),
  };

  const { layout, height } = fitToOnePage(data);
  const fitsA4 = height <= A4_HEIGHT - FOOTER_SPACE;
  const pageHeight = fitsA4 ? A4_HEIGHT : Math.ceil(height + FOOTER_SPACE);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: fitsA4 ? 'a4' : [PAGE_WIDTH, pageHeight],
  });
  draw(doc, data, layout);
  return { doc, layout, pageHeight };
}

export function generateHolidayPDF(appliances, promo, terms) {
  buildHolidayPDF(appliances, promo, terms).doc.save('holiday-protection-offer.pdf');
}

function fitToOnePage(data) {
  const canSplit = data.appliances.length >= 6;
  const attempts = canSplit
    ? [
        ...DENSITIES.filter((d) => d >= 0.8).map((density) => ({ density, splitAppliances: false })),
        ...DENSITIES.map((density) => ({ density, splitAppliances: true })),
      ]
    : DENSITIES.map((density) => ({ density, splitAppliances: false }));

  const limit = A4_HEIGHT - FOOTER_SPACE;
  let height = 0;
  for (const layout of attempts) {
    const scratch = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH, 3000] });
    height = draw(scratch, data, layout);
    if (height <= limit) return { layout, height };
  }
  return { layout: attempts[attempts.length - 1], height };
}

// A small tree for the banner: three tiers, a trunk and a star.
function drawTree(doc, cx, top, size) {
  const tiers = [
    { w: 0.55, y: 0.12, h: 0.32 },
    { w: 0.75, y: 0.3, h: 0.36 },
    { w: 0.95, y: 0.5, h: 0.38 },
  ];
  doc.setFillColor(...XMAS.green);
  for (const tier of tiers) {
    const half = (tier.w * size) / 2;
    const y0 = top + tier.y * size;
    doc.triangle(cx, y0, cx - half, y0 + tier.h * size, cx + half, y0 + tier.h * size, 'F');
  }
  doc.setFillColor(...XMAS.trunk);
  doc.rect(cx - size * 0.07, top + 0.88 * size, size * 0.14, size * 0.12, 'F');
  doc.setFillColor(...XMAS.gold);
  doc.circle(cx, top + 0.11 * size, size * 0.06, 'F');
  // Baubles.
  const baubles = [[-0.12, 0.38, XMAS.gold], [0.15, 0.58, [255, 255, 255]], [-0.2, 0.78, [255, 255, 255]], [0.22, 0.82, XMAS.gold]];
  for (const [dx, dy, color] of baubles) {
    doc.setFillColor(...color);
    doc.circle(cx + dx * size, top + dy * size, size * 0.035, 'F');
  }
}

// Red and white candy-cane stripes across the page.
function drawCandyStripe(doc, y, height) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, y, PAGE_WIDTH, height, 'F');
  doc.setFillColor(...XMAS.red);
  const step = height * 2.4;
  for (let x = -height; x < PAGE_WIDTH + height; x += step) {
    // A slanted band: a parallelogram from two triangles.
    doc.triangle(x, y + height, x + height, y, x + height + step / 2, y, 'F');
    doc.triangle(x, y + height, x + height + step / 2, y, x + step / 2, y + height, 'F');
  }
}

function applianceRows(appliances, promo) {
  return appliances.map((app, i) => [
    (i + 1).toString(),
    app.model,
    PROMO_BADGES[promo[app.id]]?.pdf ?? '',
    formatPrice(app.cost),
  ]);
}

function holidayApplianceTable(doc, m, { startY, rows, left, width, withTotalRow, promoLevels }) {
  return table(doc, {
    startY,
    head: [['#', 'Model / Description', 'Holiday Offer', 'Cost']],
    body: rows,
    margin: { left, right: PAGE_WIDTH - left - width },
    tableWidth: width,
    styles: { fontSize: m.tableFont, cellPadding: m.tablePadding, textColor: COLOR.ink },
    headStyles: { fillColor: XMAS.deepGreen, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.tableHeadFont },
    alternateRowStyles: { fillColor: [252, 250, 247] },
    columnStyles: {
      0: { cellWidth: 9 * Math.max(0.7, m.tableFont / 8.5), halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26 * Math.max(0.75, m.tableFont / 8.5), halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 25 * Math.max(0.75, m.tableFont / 8.5), halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return;
      if (withTotalRow && cell.row.index === rows.length - 1) {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = COLOR.totalRow;
        return;
      }
      if (cell.column.index === 2) {
        const level = promoLevels[cell.row.index];
        if (level) cell.cell.styles.textColor = level === 2 ? XMAS.red : XMAS.green;
      }
    },
  });
}

/**
 * Draw the whole page and return where the content ends. Used both for the
 * real page and for measuring on a scratch one.
 */
function draw(doc, data, { density, splitAppliances }) {
  const m = metricsFor(density);
  const pageHeight = doc.internal.pageSize.getHeight();
  const { appliances, promo, applianceCost, terms } = data;

  // --- Header: a red banner, a tree, and a candy-cane stripe ---
  doc.setFillColor(...XMAS.deepRed);
  doc.rect(0, 0, PAGE_WIDTH, m.headerHeight, 'F');
  drawTree(doc, PAGE_WIDTH - MARGIN - m.headerHeight * 0.3, m.headerHeight * 0.14, m.headerHeight * 0.72);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(m.titleFont);
  doc.setFont('helvetica', 'bold');
  doc.text('Holiday Protection Plan Offer', MARGIN, m.headerHeight * 0.47);

  doc.setFontSize(m.subtitleFont);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(254, 215, 170);
  doc.text('Black Friday & Christmas Promotion', MARGIN, m.headerHeight * 0.684);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(today, PAGE_WIDTH - MARGIN - m.headerHeight * 0.75, m.headerHeight * 0.684, { align: 'right' });

  const stripe = 2.6 * Math.max(0.7, density);
  drawCandyStripe(doc, m.headerHeight, stripe);
  doc.setFillColor(...XMAS.green);
  doc.rect(0, m.headerHeight + stripe, PAGE_WIDTH, 1.2 * Math.max(0.7, density), 'F');

  let y = m.headerHeight + stripe + 8 * density;

  // --- Appliances, with each one's holiday offer ---
  y = sectionTitle(doc, m, 'Appliances Covered', y, { color: XMAS.deepGreen });

  const rows = applianceRows(appliances, promo);
  const levels = appliances.map((a) => promo[a.id] || 0);
  const total = ['', 'Total', '', formatPrice(applianceCost)];
  if (splitAppliances) {
    const gap = 4;
    const width = (CONTENT_WIDTH - gap) / 2;
    const half = Math.ceil(rows.length / 2);
    const leftEnd = holidayApplianceTable(doc, m, {
      startY: y, rows: rows.slice(0, half), left: MARGIN, width, withTotalRow: false,
      promoLevels: levels.slice(0, half),
    });
    const rightEnd = holidayApplianceTable(doc, m, {
      startY: y, rows: [...rows.slice(half), total], left: MARGIN + width + gap, width, withTotalRow: true,
      promoLevels: levels.slice(half),
    });
    y = Math.max(leftEnd, rightEnd);
  } else {
    y = holidayApplianceTable(doc, m, {
      startY: y, rows: [...rows, total], left: MARGIN, width: CONTENT_WIDTH, withTotalRow: true, promoLevels: levels,
    });
  }
  y += m.sectionGap + 2 * density;

  // --- Holiday pricing per term ---
  y = sectionTitle(doc, m, 'Holiday Pricing', y, { color: XMAS.deepGreen });

  const cell = (yr, fn) => {
    const term = terms[yr];
    return term ? fn(term) : '—';
  };
  const summaryRows = [
    ['Covered free', ...PROMO_YEARS.map((yr) => cell(yr, (t) => (t.free.length ? plural(t.free.length, 'model') : '—')))],
    ['Free coverage value', ...PROMO_YEARS.map((yr) => cell(yr, (t) => (t.free.length ? formatPrice(t.freeValue) : '—')))],
    ['Best bundle', ...PROMO_YEARS.map((yr) => cell(yr, (t) => (t.paid.length ? formatPrice(t.subtotal) : '—')))],
    ['20% holiday rebate', ...PROMO_YEARS.map((yr) => cell(yr, (t) => (t.rebate ? `-${formatPrice(t.rebate.amount)}` : '—')))],
    ['Total', ...PROMO_YEARS.map((yr) => cell(yr, (t) => formatPrice(t.total)))],
  ];
  const ROW = { value: 1, rebate: 3, total: 4 };

  y = table(doc, {
    startY: y,
    head: [['', ...PROMO_YEARS.map(termLabel)]],
    body: summaryRows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: m.comparisonFont, cellPadding: m.comparisonPadding * 0.75, textColor: COLOR.ink },
    headStyles: { fillColor: XMAS.deepRed, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.comparisonFont, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
    },
    didParseCell: (c) => {
      if (c.section !== 'body') return;
      const row = c.row.index;
      if (row === ROW.value && c.column.index > 0) c.cell.styles.textColor = XMAS.green;
      if (row === ROW.rebate && c.column.index > 0) {
        c.cell.styles.textColor = XMAS.red;
        c.cell.styles.fontStyle = 'bold';
      }
      if (row === ROW.total) {
        c.cell.styles.fillColor = XMAS.paleGreen;
        c.cell.styles.fontStyle = 'bold';
        if (c.column.index > 0) {
          c.cell.styles.textColor = XMAS.green;
          c.cell.styles.fontSize = m.comparisonFont * 1.2;
        }
      }
    },
  });
  y += m.sectionGap;

  // --- The split per term, side by side ---
  doc.setTextColor(...XMAS.deepGreen);
  doc.setFontSize(Math.max(7, 10 * density));
  doc.setFont('helvetica', 'bold');
  doc.text('Breakdown by Term', MARGIN, y);
  y += 5 * density;

  const gap = 3;
  const colWidth = (CONTENT_WIDTH - gap * (PROMO_YEARS.length - 1)) / PROMO_YEARS.length;
  const top = y;
  let bottom = top;
  const small = m.breakdownFont;
  const smallLine = lineHeight(small);

  PROMO_YEARS.forEach((yr, col) => {
    const term = terms[yr];
    if (!term) return;
    const x = MARGIN + col * (colWidth + gap);
    let cy = top;

    // The term and its total.
    doc.setFillColor(...XMAS.paleRed);
    doc.rect(x, cy, colWidth, m.breakdownHeadHeight, 'F');
    doc.setFillColor(...XMAS.red);
    doc.rect(x, cy, colWidth, 0.6, 'F');
    doc.setFontSize(m.breakdownHeadFont);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...XMAS.deepRed);
    doc.text(termLabel(yr), x + 1.5, cy + m.breakdownHeadHeight * 0.42);
    doc.setTextColor(...XMAS.green);
    doc.text(formatPrice(term.total), x + colWidth - 1.5, cy + m.breakdownHeadHeight * 0.8, { align: 'right' });
    doc.setFontSize(small);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.muted);
    doc.text('Total', x + 1.5, cy + m.breakdownHeadHeight * 0.8);
    cy += m.breakdownHeadHeight + 3.2 * density;

    const heading = (label, amount, color) => {
      doc.setFontSize(small);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...color);
      doc.text(label, x + 0.5, cy);
      if (amount) doc.text(amount, x + colWidth - 0.5, cy, { align: 'right' });
      cy += smallLine;
    };
    const lines = (text, color = COLOR.muted, indent = 1.5) => {
      doc.setFontSize(small);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...color);
      const wrapped = doc.splitTextToSize(text, colWidth - indent - 0.5);
      doc.text(wrapped, x + indent, cy);
      cy += smallLine * wrapped.length;
    };

    // Covered free.
    if (term.free.length > 0) {
      heading('Free with promotion', '', XMAS.green);
      for (const { appliance, freeYears } of term.free) {
        lines(`${appliance.model} (${PROMO_BADGES[freeYears]?.short ?? 'free'})`);
      }
      lines(`Value ${formatPrice(term.freeValue)} - no charge`, XMAS.green);
      cy += m.breakdownGroupGap * 1.5;
    }

    // The best bundle for what's paid for.
    if (term.plan) {
      heading(yr === 1 ? 'Paid - each on its own' : `Best bundle - ${term.plan.label}`, '', COLOR.heading);
      for (const item of term.plan.items) {
        doc.setFontSize(small);
        doc.setTextColor(...COLOR.heading);
        if (item.appliances.length === 1) {
          // A model on its own plan takes one line: the model and its price.
          const app = item.appliances[0];
          doc.setFont('helvetica', 'normal');
          doc.text(`${app.model}${item.groupType === 'small' ? ' (small)' : ''}`, x + 1.5, cy);
          doc.setFont('helvetica', 'bold');
          doc.text(formatPrice(item.price), x + colWidth - 0.5, cy, { align: 'right' });
          cy += smallLine;
          continue;
        }
        doc.setFont('helvetica', 'bold');
        doc.text(item.groupLabel, x + 1.5, cy);
        doc.text(formatPrice(item.price), x + colWidth - 0.5, cy, { align: 'right' });
        cy += smallLine;
        lines(item.appliances.map((a) => a.model).join(', '), COLOR.muted, 2.5);
        cy += m.breakdownGroupGap * 0.6;
      }
      heading('Subtotal', formatPrice(term.subtotal), COLOR.ink);
      cy += m.breakdownGroupGap;
    } else if (term.paid.length === 0) {
      lines('Nothing to pay for - every model is covered free.', COLOR.muted, 0.5);
      cy += m.breakdownGroupGap;
    }

    // The rebate, on its own line.
    if (term.rebate) {
      heading('20% holiday rebate', `-${formatPrice(term.rebate.amount)}`, XMAS.red);
      const bundle = term.rebate.bundle;
      lines(bundle
        ? `${plural(term.rebate.appliances.length, 'qualifying model')} as one ${bundle.groupLabel} plan, ${formatPrice(bundle.price)}: ${term.rebate.appliances.map((a) => a.model).join(', ')}`
        : 'No bundle price for the qualifying models', COLOR.muted);
      cy += m.breakdownGroupGap;
    }

    // The total again, under a rule.
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(0.25);
    doc.line(x, cy - smallLine * 0.55, x + colWidth, cy - smallLine * 0.55);
    cy += smallLine * 0.35;
    heading('Total', formatPrice(term.total), XMAS.green);

    bottom = Math.max(bottom, cy);
  });

  y = bottom + m.sectionGap * 0.6;

  // --- How it works ---
  doc.setFontSize(m.noteFont);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...COLOR.muted);
  const note = doc.splitTextToSize(
    'Models marked +1 or +2 get that many additional years of protection free. Taken past their free years, '
      + 'they get a 20% rebate instead: 20% of what those models would cost together as one plan, taken off the best '
      + 'bundle for everything paid for. One additional year is sold per appliance only.',
    CONTENT_WIDTH,
  );
  doc.text(note, MARGIN, y);
  y += lineHeight(m.noteFont) * note.length + m.sectionGap;

  const contentBottom = y - m.sectionGap;

  // --- Footer ---
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.faint);
  doc.text('Holiday promotion pricing - Warranty List Options 6.01', PAGE_WIDTH / 2, pageHeight - 10, { align: 'center' });

  return contentBottom;
}
