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
// The setting that keeps each strategy's row in the pricing comparison.
const COMPARE_SETTING = {
  bestMix: 'pdfCompareBestMix',
  singleBundle: 'pdfCompareSingleBundle',
  individual: 'pdfCompareIndividual',
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
  rule: [203, 213, 225],
  totalRow: [241, 245, 249],
  breakdownHead: [226, 232, 240],
  best: [5, 150, 105],
  bestFill: [236, 253, 245],
  // Essentials Only marks its prices in orange, and nothing else.
  essentialsCost: [234, 88, 12],
};

// The terms are years added on top of the manufacturer's warranty.
const termLabel = (yr) => `${yr}-Year Additional`;

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const formatPercent = (fraction) => `${(fraction * 100).toFixed(1)}%`;

/**
 * Build the comparison PDF without saving it.
 *
 * It is always a single page. The layout is drawn on a tall scratch page to
 * measure it, and shrunk step by step until it fits an A4 page; a long
 * appliance list is split into two columns before the type gets small. Only
 * an order too big to fit even then gets one page taller than A4, so it still
 * never breaks across pages.
 *
 * `settings` (see utils/displaySettings) chooses the appliance list style,
 * which options the pricing comparison lists, and whether percentages and
 * savings are shown. `essentialAppliances` are the starred models: when there
 * are any, the page is headed "Full Coverage" and an "Essentials Only" plan
 * for just those follows it.
 */
export function buildComparisonPDF(appliances, { settings = {}, essentialAppliances = [] } = {}) {
  const data = prepare(appliances, essentialAppliances, settings);
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

export function generateComparisonPDF(appliances, options) {
  buildComparisonPDF(appliances, options).doc.save('appliance-protection-plans.pdf');
}

// The option per term with the lowest total among `strategies`, preferring
// the earlier one on a tie (so Best Mix over an equal Single Bundle).
function cheapestOption(result, strategies) {
  let bestKey = null;
  for (const key of strategies) {
    const r = result?.[key];
    if (r?.valid && (bestKey === null || r.total < result[bestKey].total)) bestKey = key;
  }
  return bestKey;
}

// Share of the appliance cost, per year, and what it saves against covering
// each appliance on its own — for one term's chosen plan.
function figuresFor(planTotal, applianceCost, individual, yr) {
  if (planTotal == null || !(applianceCost > 0)) return null;
  const share = planTotal / applianceCost;
  const saving = individual?.valid ? individual.total - planTotal : 0;
  return { share, perYear: share / yr, saving: saving > 0.005 ? saving : 0 };
}

function prepare(appliances, essentialAppliances, settings) {
  let strategies = STRATEGIES.filter((key) => settings[COMPARE_SETTING[key]] !== false);
  if (strategies.length === 0) strategies = STRATEGIES;

  const applianceCost = appliances.reduce((sum, a) => sum + a.cost, 0);
  const results = {};
  const best = {};
  for (const yr of WARRANTY_YEARS) {
    results[yr] = calculateAll(appliances, yr);
    // The breakdown and highlight follow the options being shown, so the
    // page never recommends one it doesn't list.
    best[yr] = cheapestOption(results[yr], strategies);
  }

  let essentials = null;
  if (essentialAppliances.length > 0) {
    const cost = essentialAppliances.reduce((sum, a) => sum + a.cost, 0);
    const plans = {};
    const figures = {};
    for (const yr of WARRANTY_YEARS) {
      // Essentials is always the true best bundle for those models, however
      // the comparison above is filtered.
      const result = calculateAll(essentialAppliances, yr);
      const key = cheapestOption(result, STRATEGIES);
      plans[yr] = key ? result[key] : null;
      figures[yr] = figuresFor(plans[yr]?.total, cost, result.individual, yr);
    }
    essentials = { appliances: essentialAppliances, cost, plans, figures };
  }

  return {
    appliances,
    applianceCost,
    results,
    best,
    strategies,
    condensed: settings.pdfApplianceStyle === 'condensed',
    percentages: settings.pdfPercentages === true,
    essentials,
  };
}

// The largest layout that fits an A4 page, and how tall it is.
function fitToOnePage(data) {
  const canSplit = !data.condensed && data.appliances.length >= 6;
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
    height = measure(data, layout);
    if (height <= limit) return { layout, height };
  }
  return { layout: attempts[attempts.length - 1], height };
}

function measure(data, layout) {
  // Tall enough that nothing paginates, so the result is the true height.
  const scratch = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH, 3000] });
  return draw(scratch, data, layout);
}

function metricsFor(d) {
  return {
    headerHeight: 38 * Math.max(0.7, d),
    titleFont: 18 * Math.max(0.75, d),
    subtitleFont: 10 * Math.max(0.75, d),
    scopeFont: Math.max(8, 13 * d),
    sectionFont: Math.max(7, 11 * d),
    noteFont: Math.max(5.5, 8 * d),
    tableFont: 8.5 * d,
    tableHeadFont: 8 * d,
    tablePadding: Math.max(0.6, 2 * d),
    comparisonFont: 9 * d,
    comparisonPadding: Math.max(0.8, 3 * d),
    sectionGap: 8 * d,
    breakdownHeadHeight: 11 * d,
    breakdownHeadFont: 7.5 * d,
    breakdownFont: 6.5 * d,
    breakdownGroupLine: 3.5 * d,
    breakdownLine: 3 * d,
    breakdownGroupGap: 1 * d,
  };
}

// Line height in mm for a font size in points.
const lineHeight = (pt) => pt * 0.3528 * 1.25;

// Draw a table and return where it ends.
function table(doc, options) {
  const result = autoTable(doc, options);
  return result?.finalY ?? doc.lastAutoTable?.finalY ?? options.startY;
}

function sectionTitle(doc, m, title, y, { note, color = COLOR.ink, size = m.sectionFont } = {}) {
  doc.setTextColor(...color);
  doc.setFontSize(size);
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

// "Full Coverage" and "Essentials Only": a larger heading over a rule.
function scopeHeading(doc, m, density, y, title, note) {
  const end = sectionTitle(doc, m, title, y + 1 * density, { size: m.scopeFont, note });
  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, end, PAGE_WIDTH - MARGIN, end);
  return end + 6 * density;
}

function applianceTable(doc, m, { startY, rows, left, width, withTotalRow }) {
  return table(doc, {
    startY,
    head: [['#', 'Model / Description', 'Cost']],
    body: rows,
    margin: { left, right: PAGE_WIDTH - left - width },
    tableWidth: width,
    styles: { fontSize: m.tableFont, cellPadding: m.tablePadding, textColor: COLOR.ink },
    headStyles: { fillColor: COLOR.heading, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.tableHeadFont },
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

// Three appliances to a row, model and cost side by side.
function condensedApplianceTable(doc, m, { startY, appliances, total }) {
  const PER_ROW = 3;
  const rows = [];
  for (let i = 0; i < appliances.length; i += PER_ROW) {
    const row = [];
    for (let j = 0; j < PER_ROW; j++) {
      const app = appliances[i + j];
      row.push(app ? app.model : '', app ? formatPrice(app.cost) : '');
    }
    rows.push(row);
  }
  rows.push(['', '', '', '', 'Total', formatPrice(total)]);

  const costWidth = 24 * Math.max(0.75, m.tableFont / 8.5);
  return table(doc, {
    startY,
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: m.tableFont * 0.95, cellPadding: m.tablePadding * 0.6, textColor: COLOR.ink },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { cellWidth: costWidth, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: costWidth, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: costWidth, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (cell) => {
      if (cell.row.index === rows.length - 1) {
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
function draw(doc, data, { density, splitAppliances }) {
  const m = metricsFor(density);
  const pageHeight = doc.internal.pageSize.getHeight();
  const { appliances, applianceCost, results, best, strategies, condensed, percentages, essentials } = data;

  // --- Header ---
  doc.setFillColor(...COLOR.banner);
  doc.rect(0, 0, PAGE_WIDTH, m.headerHeight, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(m.titleFont);
  doc.setFont('helvetica', 'bold');
  doc.text('Appliance Protection Plans', MARGIN, m.headerHeight * 0.47);

  doc.setFontSize(m.subtitleFont);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.faint);
  doc.text('Pricing Comparison', MARGIN, m.headerHeight * 0.684);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(today, PAGE_WIDTH - MARGIN, m.headerHeight * 0.684, { align: 'right' });

  let y = m.headerHeight + 8 * density;

  // With an Essentials Only plan on the page, say plainly that this part
  // covers everything, so it reads as the main recommendation.
  if (essentials) {
    y = scopeHeading(doc, m, density, y, 'Full Coverage',
      `All ${appliances.length} appliance${appliances.length === 1 ? '' : 's'} on this order`);
  }

  // --- Appliances covered ---
  y = sectionTitle(doc, m, 'Appliances Covered', y);

  if (condensed) {
    y = condensedApplianceTable(doc, m, { startY: y, appliances, total: applianceCost });
  } else {
    const rows = appliances.map((app, i) => [(i + 1).toString(), app.model, formatPrice(app.cost)]);
    const total = ['', 'Total', formatPrice(applianceCost)];

    if (splitAppliances) {
      const gap = 4;
      const width = (CONTENT_WIDTH - gap) / 2;
      const half = Math.ceil(rows.length / 2);
      const leftEnd = applianceTable(doc, m, {
        startY: y, rows: rows.slice(0, half), left: MARGIN, width, withTotalRow: false,
      });
      const rightEnd = applianceTable(doc, m, {
        startY: y, rows: [...rows.slice(half), total], left: MARGIN + width + gap, width, withTotalRow: true,
      });
      y = Math.max(leftEnd, rightEnd);
    } else {
      y = applianceTable(doc, m, {
        startY: y, rows: [...rows, total], left: MARGIN, width: CONTENT_WIDTH, withTotalRow: true,
      });
    }
  }
  y += m.sectionGap + 2 * density;

  // --- Pricing comparison: the options chosen in settings ---
  y = sectionTitle(doc, m, 'Pricing Comparison', y);

  const optionRows = strategies.map((key) => [
    STRATEGY_LABELS[key],
    ...WARRANTY_YEARS.map((yr) => {
      const r = results[yr]?.[key];
      return r?.valid ? formatPrice(r.total) : '—';
    }),
  ]);

  // Optional figures for the best option per term, under the options.
  const figureRows = [];
  if (percentages) {
    const figures = WARRANTY_YEARS.map((yr) =>
      figuresFor(results[yr]?.[best[yr]]?.total, applianceCost, results[yr]?.individual, yr));
    figureRows.push(
      ['% of appliance cost', ...figures.map((f) => (f ? formatPercent(f.share) : '—'))],
      ['% per year', ...figures.map((f) => (f ? formatPercent(f.perYear) : '—'))],
      ['Savings vs Individual', ...figures.map((f) => (f?.saving ? formatPrice(f.saving) : '—'))],
    );
  }

  y = table(doc, {
    startY: y,
    head: [['Strategy', ...WARRANTY_YEARS.map(termLabel)]],
    body: [...optionRows, ...figureRows],
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: m.comparisonFont, cellPadding: m.comparisonPadding, textColor: COLOR.ink },
    headStyles: { fillColor: COLOR.heading, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: m.comparisonFont },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
    },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return;
      const key = strategies[cell.row.index];

      if (!key) {
        // A figures row: quieter than the prices it describes.
        cell.cell.styles.textColor = COLOR.muted;
        cell.cell.styles.fontSize = m.comparisonFont * 0.88;
        cell.cell.styles.cellPadding = m.comparisonPadding * 0.6;
        cell.cell.styles.fillColor = [255, 255, 255];
        return;
      }

      // Only the winning option is bold, so it stands out by weight as well
      // as by colour.
      if (cell.column.index === 0) {
        cell.cell.styles.fontStyle = WARRANTY_YEARS.some((yr) => best[yr] === key) ? 'bold' : 'normal';
        return;
      }
      if (best[WARRANTY_YEARS[cell.column.index - 1]] === key) {
        cell.cell.styles.textColor = COLOR.best;
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = COLOR.bestFill;
      }
    },
  });
  y += m.sectionGap;

  // --- Best option breakdown: the cheapest shown option per term ---
  doc.setTextColor(...COLOR.ink);
  doc.setFontSize(Math.max(7, 10 * density));
  doc.setFont('helvetica', 'bold');
  doc.text('Best Option Breakdown', MARGIN, y);
  y += 5 * density;

  const colWidth = (CONTENT_WIDTH - 6) / 3;
  const top = y;
  let bottom = top;

  WARRANTY_YEARS.forEach((yr, col) => {
    const bestKey = best[yr];
    if (!bestKey) return;
    const option = results[yr][bestKey];

    const x = MARGIN + col * (colWidth + 3);
    let cy = top;

    // Two lines: the term and its price, then which option it is.
    doc.setFillColor(...COLOR.breakdownHead);
    doc.rect(x, cy, colWidth, m.breakdownHeadHeight, 'F');
    doc.setFontSize(m.breakdownHeadFont);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.heading);
    doc.text(termLabel(yr), x + 2, cy + m.breakdownHeadHeight * 0.42);
    doc.text(formatPrice(option.total), x + colWidth - 2, cy + m.breakdownHeadHeight * 0.42, { align: 'right' });
    doc.setFontSize(m.breakdownFont);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.muted);
    doc.text(STRATEGY_LABELS[bestKey], x + 2, cy + m.breakdownHeadHeight * 0.8);
    cy += m.breakdownHeadHeight + 3.2 * density;

    doc.setFontSize(m.breakdownFont);
    for (const item of option.items) {
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

  // --- Essentials Only: a smaller plan for the starred models ---
  if (essentials) y = drawEssentials(doc, m, density, essentials, y, percentages);

  // The last section's trailing gap isn't content.
  const contentBottom = y - m.sectionGap;

  // --- Footer ---
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.faint);
  doc.text('Warranty List Options 6.0 — Protection Plan Calculator', PAGE_WIDTH / 2, pageHeight - 10, { align: 'center' });

  return contentBottom;
}

// Lay out runs of text left to right, wrapping between items rather than
// inside one, each run in its own colour and weight. Returns the baseline of
// the last line.
function flowText(doc, items, { x, y, width, size, lineGap, separator }) {
  doc.setFontSize(size);
  const runWidth = (run) => {
    doc.setFont('helvetica', run.bold ? 'bold' : 'normal');
    return doc.getTextWidth(run.text);
  };
  doc.setFont('helvetica', 'normal');
  const sepWidth = doc.getTextWidth(separator);

  let cx = x;
  let cy = y;
  items.forEach((runs, i) => {
    const itemWidth = runs.reduce((w, run) => w + runWidth(run), 0);
    if (i > 0) {
      if (cx + sepWidth + itemWidth > x + width) {
        cy += lineGap;
        cx = x;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLOR.faint);
        doc.text(separator, cx, cy);
        cx += sepWidth;
      }
    }
    for (const run of runs) {
      doc.setFont('helvetica', run.bold ? 'bold' : 'normal');
      doc.setTextColor(...run.color);
      doc.text(run.text, cx, cy);
      cx += doc.getTextWidth(run.text);
    }
  });
  return cy;
}

/**
 * Essentials Only, laid out like Full Coverage's heading but without tables,
 * so it reads as the smaller alternative. Its prices are in orange. It lists
 * the starred models, then the best bundle for them per term — every plan in
 * it, so a bundle split into several plans shows as such.
 */
function drawEssentials(doc, m, density, essentials, startY, percentages) {
  const count = essentials.appliances.length;
  let y = scopeHeading(doc, m, density, startY, 'Essentials Only',
    `Covers only ${count === 1 ? 'the 1 selected appliance' : `the ${count} selected appliances`}`);
  y += lineHeight(m.tableFont) * 0.35;

  // The total, on the right of the first line.
  doc.setFontSize(m.tableFont);
  doc.setFont('helvetica', 'bold');
  const totalPrice = formatPrice(essentials.cost);
  const totalPriceWidth = doc.getTextWidth(totalPrice);
  doc.setTextColor(...COLOR.essentialsCost);
  doc.text(totalPrice, PAGE_WIDTH - MARGIN, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.ink);
  doc.text('Total ', PAGE_WIDTH - MARGIN - totalPriceWidth, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  const totalWidth = doc.getTextWidth('Total ') + totalPriceWidth;

  // The models, flowed across the rest of the line.
  y = flowText(
    doc,
    essentials.appliances.map((a) => [
      { text: `${a.model} `, color: COLOR.heading },
      { text: formatPrice(a.cost), color: COLOR.essentialsCost, bold: true },
    ]),
    {
      x: MARGIN,
      y,
      width: CONTENT_WIDTH - totalWidth - 6,
      size: m.tableFont,
      lineGap: lineHeight(m.tableFont),
      separator: '   ·   ',
    },
  );
  y += 4 * density + lineHeight(m.tableFont) * 0.6;

  // The best bundle per term, side by side.
  const gap = 5;
  const colWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const top = y;
  let bottom = top;

  WARRANTY_YEARS.forEach((yr, col) => {
    const plan = essentials.plans[yr];
    const figures = essentials.figures[yr];
    const x = MARGIN + col * (colWidth + gap);
    let ty = top;

    doc.setFontSize(m.tableFont);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.ink);
    doc.text(termLabel(yr), x, ty);
    doc.setTextColor(...COLOR.essentialsCost);
    doc.text(plan ? formatPrice(plan.total) : '—', x + colWidth, ty, { align: 'right' });
    ty += lineHeight(m.tableFont) * 0.95;

    if (percentages && figures) {
      doc.setFontSize(m.breakdownFont);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR.muted);
      doc.text(`${formatPercent(figures.share)} of cost · ${formatPercent(figures.perYear)} per year`, x, ty);
      ty += lineHeight(m.breakdownFont);
      if (figures.saving) {
        doc.text(`Saves ${formatPrice(figures.saving)} vs Individual`, x, ty);
        ty += lineHeight(m.breakdownFont);
      }
    }
    ty += 0.8 * density;

    for (const item of plan?.items ?? []) {
      doc.setFontSize(m.breakdownFont);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR.heading);
      doc.text(item.groupLabel, x, ty);
      doc.setTextColor(...COLOR.essentialsCost);
      doc.text(formatPrice(item.price), x + colWidth, ty, { align: 'right' });
      ty += lineHeight(m.breakdownFont);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR.muted);
      const models = doc.splitTextToSize(item.appliances.map((a) => a.model).join(', '), colWidth - 2);
      doc.text(models, x + 1.5, ty);
      ty += lineHeight(m.breakdownFont) * models.length + 1 * density;
    }
    bottom = Math.max(bottom, ty);
  });

  return bottom + m.sectionGap;
}
