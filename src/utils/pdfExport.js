import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateAll } from './calculator';
import { WARRANTY_YEARS } from '../data/warrantyPricing';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Generate a PDF comparing warranty plans across 2, 3, and 4 year terms.
 * Compact layout with side-by-side breakdowns.
 */
export function generateComparisonPDF(appliances) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // --- Header ---
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Warranty Protection Plan', margin, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Pricing Comparison', margin, 26);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(today, pageWidth - margin, 26, { align: 'right' });

  y = 46;

  // --- Appliance List ---
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Appliances Covered', margin, y);
  y += 2;

  const applianceRows = appliances.map((app, i) => [
    (i + 1).toString(),
    app.model,
    formatPrice(app.cost),
  ]);

  const totalCost = appliances.reduce((sum, a) => sum + a.cost, 0);
  applianceRows.push(['', 'Total', formatPrice(totalCost)]);

  let tableResult = autoTable(doc, {
    startY: y,
    head: [['#', 'Model / Description', 'Cost']],
    body: applianceRows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === applianceRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  y = (tableResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 30) + 10;

  // --- Calculate for all years ---
  const allResults = {};
  for (const yr of WARRANTY_YEARS) {
    allResults[yr] = calculateAll(appliances, yr);
  }

  // --- Pricing Comparison Table ---
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Pricing Comparison', margin, y);
  y += 2;

  const strategies = ['bestMix', 'singleBundle', 'individual'];
  const strategyLabels = {
    bestMix: 'Best Mix',
    singleBundle: 'Single Bundle',
    individual: 'Individual',
  };

  const comparisonRows = strategies.map((key) => {
    const row = [strategyLabels[key]];
    for (const yr of WARRANTY_YEARS) {
      const r = allResults[yr]?.[key];
      row.push(r?.valid ? formatPrice(r.total) : '—');
    }
    return row;
  });

  const bestPerYear = {};
  for (const yr of WARRANTY_YEARS) {
    let best = null;
    for (const key of strategies) {
      const r = allResults[yr]?.[key];
      if (r?.valid && (best === null || r.total < best)) {
        best = r.total;
      }
    }
    bestPerYear[yr] = best;
  }

  tableResult = autoTable(doc, {
    startY: y,
    head: [['Strategy', '2-Year', '3-Year', '4-Year']],
    body: comparisonRows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 'auto', halign: 'center' },
      2: { cellWidth: 'auto', halign: 'center' },
      3: { cellWidth: 'auto', halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        const yr = WARRANTY_YEARS[data.column.index - 1];
        const key = strategies[data.row.index];
        const r = allResults[yr]?.[key];
        if (r?.valid && bestPerYear[yr] !== null && r.total === bestPerYear[yr]) {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  y = (tableResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 30) + 8;

  // --- Compact Side-by-Side Breakdown ---
  // Build breakdown data for all 3 years
  const breakdownData = [];
  for (const yr of WARRANTY_YEARS) {
    const result = allResults[yr];
    if (!result) { breakdownData.push(null); continue; }

    let bestKey = null;
    let bestTotal = null;
    for (const key of strategies) {
      const r = result[key];
      if (r?.valid && (bestTotal === null || r.total < bestTotal)) {
        bestTotal = r.total;
        bestKey = key;
      }
    }

    if (!bestKey) { breakdownData.push(null); continue; }
    breakdownData.push({
      yr,
      label: strategyLabels[bestKey],
      total: bestTotal,
      items: result[bestKey].items,
    });
  }

  // Draw all 3 breakdowns as columns side by side
  const colWidth = (pageWidth - margin * 2 - 6) / 3; // 3mm gaps between cols

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Best Option Breakdown', margin, y);
  y += 5;

  const startY = y;
  for (let col = 0; col < 3; col++) {
    const bd = breakdownData[col];
    if (!bd) continue;

    const x = margin + col * (colWidth + 3);
    let cy = startY;

    // Column header
    doc.setFillColor(226, 232, 240);
    doc.rect(x, cy, colWidth, 7, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(`${bd.yr}-Year: ${bd.label} — ${formatPrice(bd.total)}`, x + 2, cy + 5);
    cy += 9;

    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    for (const item of bd.items) {
      // Group label + price
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text(item.groupLabel, x + 1, cy);
      doc.text(formatPrice(item.price), x + colWidth - 1, cy, { align: 'right' });
      cy += 3.5;

      // Appliance names
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      for (const app of item.appliances) {
        const label = app.model.length > 18 ? app.model.substring(0, 18) + '...' : app.model;
        doc.text(label, x + 2, cy);
        cy += 3;
      }
      cy += 1;
    }
  }

  // Find max height used
  y = startY + 80; // reserve space, will be adjusted by content

  // --- Footer ---
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Warranty List Options 6.0 — Protection Plan Calculator', pageWidth / 2, 287, { align: 'center' });

  doc.save('warranty-comparison.pdf');
}
