import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const APPLIANCE_TYPES = [
  ['refrigerat', 'Refrigerator'], ['fridge', 'Refrigerator'], ['freezer', 'Freezer'],
  ['f/r', 'Refrigerator'],
  ['washer', 'Washer'], ['washing', 'Washer'], ['laundry', 'Laundry'],
  ['w/d', 'Washer/Dryer'],
  ['dryer', 'Dryer'],
  ['dishwasher', 'Dishwasher'], ['d/w', 'Dishwasher'],
  ['range', 'Range'], ['stove', 'Range'], ['oven', 'Oven'], ['cooktop', 'Cooktop'],
  ['induction', 'Range'],
  ['microwave', 'Microwave'], ['m/w', 'Microwave'],
  ['hoodfan', 'Hood Fan'], ['hood', 'Hood'], ['ventilat', 'Ventilation'],
  ['compactor', 'Compactor'],
  ['ice maker', 'Ice Maker'],
  ['wine', 'Wine Cooler'], ['beverage', 'Beverage Center'],
  ['air cond', 'Air Conditioner'],
  ['dehumid', 'Dehumidifier'], ['humidif', 'Humidifier'],
  ['water heater', 'Water Heater'],
  ['dispos', 'Disposal'],
  ['insert', 'Insert'], ['fireplace', 'Fireplace'],
  ['grill', 'Grill'], ['bbq', 'BBQ'],
  ['warming drawer', 'Warming Drawer'], ['drawer', 'Warming Drawer'],
  ['column', 'Column'],
];

const BRANDS = [
  'LG', 'Samsung', 'Whirlpool', 'GE', 'Bosch', 'KitchenAid', 'Maytag',
  'Frigidaire', 'Electrolux', 'Miele', 'Sub-Zero', 'Wolf', 'Viking',
  'Thermador', 'JennAir', 'Jenn-Air', 'Amana', 'Kenmore', 'Beko', 'Haier',
  'Fisher & Paykel', 'Fisher and Paykel', 'Blomberg', 'Cafe', 'Café',
  'Monogram', 'Profile', 'Dacor', 'Bertazzoni', 'Speed Queen', 'Asko',
  'Hisense', 'Insignia', 'Danby', 'Panasonic', 'Sharp', 'Midea',
  'Zephyr', 'Broan', 'Faber', 'Fulgor Milano', 'Smeg', 'La Cornue',
  'Fisher Paykel', 'GE Profile', 'GE Cafe', 'Liebherr',
];

// Longest keyword first, so "dishwasher" wins over "washer" and
// "warming drawer" wins over "drawer".
const APPLIANCE_TYPES_BY_LENGTH = [...APPLIANCE_TYPES].sort((a, b) => b[0].length - a[0].length);

// Find the appliance type in a chunk of description text.
function matchApplianceType(text) {
  if (!text) return '';
  const lower = text.toLowerCase();

  for (const [keyword, label] of APPLIANCE_TYPES_BY_LENGTH) {
    if (lower.includes(keyword)) return label;
  }

  // Retry ignoring spaces/commas/slashes, e.g. "HOOD FAN" → "hoodfan"
  const collapsed = lower.replace(/[\s,/]+/g, '');
  for (const [keyword, label] of APPLIANCE_TYPES_BY_LENGTH) {
    if (collapsed.includes(keyword.replace(/[\s/]+/g, ''))) return label;
  }

  return '';
}

function cleanDescription(rawDesc) {
  if (!rawDesc) return '';
  const lower = rawDesc.toLowerCase();

  let brand = '';
  // First, check if description is comma-separated (invoice format: "LG, WASHER, F/L, GRAPHITE STEEL")
  // Brand is the first token before the first comma
  if (rawDesc.includes(',')) {
    const firstPart = rawDesc.split(',')[0].trim();
    // Check if firstPart matches a known brand (case-insensitive)
    for (const b of BRANDS) {
      if (firstPart.toLowerCase() === b.toLowerCase()) {
        brand = b;
        break;
      }
    }
    // If not a known brand but looks like one (short uppercase word), use it as-is
    if (!brand && /^[A-Z][A-Za-z&\s\-]{1,20}$/.test(firstPart) && !/\d/.test(firstPart)) {
      brand = firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
    }
  }

  // Fallback: search entire text for known brand names
  if (!brand) {
    for (const b of BRANDS) {
      if (lower.includes(b.toLowerCase())) {
        brand = b;
        break;
      }
    }
  }

  const type = matchApplianceType(rawDesc);

  if (brand && type) return `${brand} - ${type}`;
  if (brand) return brand;
  if (type) return type;
  return '';
}

// Validate that a string looks like an appliance model number
function isValidModel(str) {
  if (!str || str.length < 5 || str.length > 20) return false;
  // Must start with a letter
  if (!/^[A-Z]/.test(str)) return false;
  // Must contain at least one digit
  if (!/\d/.test(str)) return false;
  // Must contain at least 2 letters
  if ((str.match(/[A-Z]/g) || []).length < 2) return false;
  // Reject common non-model patterns
  if (/^(ORDER|DATE|ITEM|QTY|PRICE|TOTAL|PAGE|INV|PO\d|ACCT)/i.test(str)) return false;
  // Reject if it looks like a date (e.g., JAN152025)
  if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d/i.test(str)) return false;
  return true;
}

// Anything cheaper than this is an accessory (hose kit, trim, cord), not an
// appliance we'd write a protection plan on.
const MIN_ITEM_PRICE = 50;

// What a single column header means, e.g. "MSRP*" → 'msrp', "Your Price" → 'price'.
function columnRole(label) {
  const l = label.toLowerCase().replace(/[*#:.]/g, '').trim();
  if (!l) return null;
  if (/^m\s?s\s?r\s?p$/.test(l)) return 'msrp';
  if (/^(?:list|retail|reg(?:ular)?)(?:\s*price)?$/.test(l)) return 'msrp';
  if (/^install(?:ation)?$/.test(l)) return 'install';
  if (/^(?:qty|quantity|qnty)$/.test(l)) return 'qty';
  if (/^(?:your|unit|net|sale|sell|our)\s*price$/.test(l)) return 'price';
  if (/^price$/.test(l)) return 'price';
  if (/^(?:(?:ext(?:ended)?|line)\s*)?total$/.test(l)) return 'total';
  if (/^(?:amount|ext(?:ended)?)$/.test(l)) return 'total';
  return null;
}

/**
 * Read the item table's header. Which columns a quote shows varies — MSRP and
 * Install are optional, and a salesperson can add MSRP to a quote that didn't
 * show it before — so rows are mapped onto this instead of assuming a fixed
 * position for the customer's price.
 *
 * @returns {string[]} column roles in order, e.g. ['msrp','install','qty','price','total']
 */
function parseQuoteColumns(text) {
  const headerMatch = text.match(/\b(?:item\s*)?(?:details|description)\b/i);
  if (!headerMatch) return [];

  // Column headers sit between the "Details" label and the first item row.
  const region = text.slice(headerMatch.index + headerMatch[0].length, headerMatch.index + 220);
  const chunks = region.split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter(Boolean);

  const columns = [];
  for (const chunk of chunks) {
    const role = columnRole(chunk);
    if (!role) break; // first non-header chunk = the first item's description
    columns.push(role);
  }

  // Without a price or total column there's nothing to line rows up against.
  return columns.includes('price') || columns.includes('total') ? columns : [];
}

// Cells of one row: money (in parentheses when it's a credit/rebate), an "N/A"
// placeholder, or the bare integer in the Qty column. Matching whole amounts
// keeps us from reading the "1" of "$1,449.98" as a quantity.
const CELL_PATTERN =
  /\(\s*\$?\s*[\d,]+\.\d{2}\s*\)|\$\s*[\d,]+\.\d{2}|\b\d[\d,]*\.\d{2}\b|N\s*\/\s*A|\bINCL(?:UDED)?\b|\b\d{1,3}\b/gi;

const LEADING_CELLS_PATTERN =
  /^(?:\s*(?:\(\s*\$?\s*[\d,]+\.\d{2}\s*\)|\$\s*[\d,]+\.\d{2}|\d[\d,]*\.\d{2}|N\s*\/\s*A|INCL(?:UDED)?|\d{1,3}))+/i;

function parseRowCells(rowText) {
  const cells = [];
  CELL_PATTERN.lastIndex = 0;
  let match;

  while ((match = CELL_PATTERN.exec(rowText)) !== null) {
    const raw = match[0];
    if (raw.startsWith('(')) continue; // rebate/credit, not a column value
    if (/^[a-z]/i.test(raw)) {
      cells.push({ kind: 'blank' }); // N/A or Included
    } else if (raw.includes('.')) {
      const value = parseFloat(raw.replace(/[$,\s]/g, ''));
      if (isNaN(value)) continue;
      cells.push({ kind: 'money', value });
    } else {
      cells.push({ kind: 'count', value: parseInt(raw, 10) });
    }
  }

  return cells;
}

// Do the row's cells line up with the header when shifted by `offset`?
function layoutFits(cells, columns, offset) {
  for (let i = 0; i < columns.length; i++) {
    const cell = cells[i + offset];
    if (!cell) return false;
    if (columns[i] === 'qty') {
      if (cell.kind !== 'count') return false;
    } else if (columns[i] === 'install') {
      if (cell.kind !== 'money' && cell.kind !== 'blank') return false;
    } else if (cell.kind !== 'money') {
      return false;
    }
  }
  return true;
}

function priceFromColumns(cells, columns) {
  const priceIndex = columns.indexOf('price');
  if (priceIndex === -1) return null;

  // Stray numbers in the description ('30"') can push the row right, so try
  // each alignment and use the first that matches the header's shape.
  const maxOffset = Math.max(0, cells.length - columns.length);
  for (let offset = 0; offset <= maxOffset; offset++) {
    if (!layoutFits(cells, columns, offset)) continue;
    const cell = cells[priceIndex + offset];
    if (cell && cell.kind === 'money') return cell.value;
  }
  return null;
}

// No usable header: the customer's price is the first amount after Qty, which
// leaves MSRP and Install (which come before it) out of play.
function priceAfterQty(cells) {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].kind !== 'count') continue;
    for (let j = i + 1; j < cells.length; j++) {
      if (cells[j].kind === 'money') return cells[j].value;
      if (cells[j].kind === 'count') break;
    }
  }
  return null;
}

function firstPriceCell(cells, columns) {
  const skip = new Set([columns.indexOf('msrp'), columns.indexOf('install')]);
  for (let i = 0; i < cells.length; i++) {
    if (skip.has(i)) continue;
    if (cells[i].kind === 'money' && cells[i].value >= MIN_ITEM_PRICE) return cells[i].value;
  }
  return null;
}

/**
 * Price for one quote row, in confidence order. The first two strategies are
 * trusted outright: if they find the customer's price and it's below the
 * accessory threshold, the row is dropped rather than re-read from a column
 * we know isn't the customer's price.
 */
function pickQuotePrice(rowText, columns) {
  const cells = parseRowCells(rowText);

  const mapped = priceFromColumns(cells, columns);
  if (mapped !== null) return mapped >= MIN_ITEM_PRICE ? mapped : null;

  const afterQty = priceAfterQty(cells);
  if (afterQty !== null) return afterQty >= MIN_ITEM_PRICE ? afterQty : null;

  const labelled = rowText.match(/your\s*price\s*\$?\s*([\d,]+\.\d{2})/i);
  if (labelled) {
    const value = parseFloat(labelled[1].replace(/,/g, ''));
    if (!isNaN(value) && value >= MIN_ITEM_PRICE) return value;
  }

  return firstPriceCell(cells, columns);
}

/**
 * Description for one quote row: the text between the previous model number
 * and this one, e.g. "LG, DISHWASHER, SS" → "LG - Dishwasher".
 */
function describeQuoteRow(rawDesc) {
  // Drop the previous row's price cells, which sit ahead of this description.
  const text = rawDesc.replace(LEADING_CELLS_PATTERN, '').trim();
  if (!text) return '';

  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  // On the table's first row the header ("... Qty  Your Price  Total  LG")
  // still leads the description; the brand is the last column-separated chunk.
  const brandPart = (parts[0] || '').split(/\s{2,}/).pop().trim();
  const brandLower = brandPart.toLowerCase();

  let brand = '';
  for (const b of BRANDS) {
    const bl = b.toLowerCase();
    if (brandLower === bl || brandLower.startsWith(`${bl} `)) {
      brand = b;
      break;
    }
  }
  if (!brand) {
    const lower = text.toLowerCase();
    for (const b of BRANDS) {
      if (lower.includes(b.toLowerCase())) {
        brand = b;
        break;
      }
    }
  }
  if (!brand && /^[A-Za-z][A-Za-z&.'-]{1,15}(?:\s[A-Za-z&.'-]{1,15})?$/.test(brandPart)) {
    brand = brandPart;
  }

  // Look for the type past the brand, falling back to the whole description.
  let type = matchApplianceType(parts.slice(1).join(', ')) || matchApplianceType(text);
  if (!type && parts[1] && /^[A-Za-z][A-Za-z\s/-]{1,18}$/.test(parts[1])) {
    type = parts[1];
  }

  if (brand && type) return `${brand} - ${type}`;
  if (brand) return brand;
  return type;
}

export default function DocumentUpload({ onParsedItems }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [parseResults, setParseResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) processFile(files[0]);
  }

  function processFile(file) {
    setFileName(file.name);

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      parsePDF(file);
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      parseCSV(file);
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      parseText(file);
    } else {
      setParseResults({
        success: false,
        message: 'Supported formats: PDF (.pdf), CSV (.csv), or Text (.txt)',
      });
    }
  }

  async function parsePDF(file) {
    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(' ');
        fullText += pageText + '\n';
      }

      // Try quote parser first (parenthesized model numbers)
      let items = parseQuoteText(fullText);

      // Try invoice parser if quote didn't find anything
      if (items.length === 0) {
        items = parseInvoiceText(fullText);
      }

      // Fallback generic parser
      if (items.length === 0) {
        items = parseGenericText(fullText);
      }

      if (items.length > 0) {
        const source = items[0]._source || 'PDF';
        setParseResults({ success: true, message: `Found ${items.length} appliance(s) from ${source}`, items });
      } else {
        setParseResults({
          success: false,
          message: 'No appliance data found in PDF. Try a quote or invoice with model numbers and prices.',
        });
      }
    } catch {
      setParseResults({ success: false, message: 'Error reading PDF file. Please try a different file.' });
    }
    setLoading(false);
  }

  /**
   * Parse quote-style PDFs: find model numbers in parentheses.
   * Price extraction: read the item table's header, then take the cell in the
   * customer's price column ("Your Price") for each row — so an MSRP column,
   * present or not, is never mistaken for the price. Rebates (amounts in
   * parentheses) are ignored.
   * Descriptions: comma-separated like "KitchenAid, Range, Induction" → Brand - Type.
   */
  function parseQuoteText(text) {
    const items = [];
    const columns = parseQuoteColumns(text);

    const modelPattern = /\(([A-Z0-9][A-Z0-9\-\/]+[A-Z0-9])\)/g;
    let match;
    const modelPositions = [];

    while ((match = modelPattern.exec(text)) !== null) {
      const model = match[1];
      // Skip if it looks like a rebate code or known non-model
      if (/^(ORDER|DATE|ITEM|QTY|TAX|HST|GST)/i.test(model)) continue;
      if (!isValidModel(model)) continue;

      // Grab text before this model's parentheses for description (up to 200 chars back)
      const descStart = modelPositions.length > 0
        ? modelPositions[modelPositions.length - 1].endIndex
        : Math.max(0, match.index - 200);
      const rawDesc = text.substring(descStart, match.index).trim();
      const description = describeQuoteRow(rawDesc) || cleanDescription(rawDesc);

      modelPositions.push({
        model,
        matchIndex: match.index,
        endIndex: match.index + match[0].length,
        description,
      });
    }

    // For each model, read its row of the item table and take the customer's price
    for (let i = 0; i < modelPositions.length; i++) {
      const { model, endIndex, description } = modelPositions[i];
      // Search from model end to next model start (or +500 chars)
      const searchEnd = i + 1 < modelPositions.length
        ? modelPositions[i + 1].matchIndex
        : endIndex + 500;
      const searchText = text.substring(endIndex, Math.min(searchEnd, text.length));

      const cost = pickQuotePrice(searchText, columns);

      if (cost !== null) {
        items.push({
          id: crypto.randomUUID(),
          model,
          cost,
          isSmall: false,
          description,
          _source: 'Quote',
        });
      }
    }

    return items;
  }

  /**
   * Parse invoice-style PDFs.
   * Same logic that worked before: find MODEL header, then match model tokens
   * followed by description and price. Only change: process each page separately
   * so SUBTOTAL on page 1 doesn't cut off page 2 items.
   */
  function parseInvoiceText(text) {
    const items = [];
    const seenModels = new Set();

    // Skip patterns for non-appliance lines
    const skipPattern = /(?:delivery|install|hose\s*kit|bracket|connector|cpp|protection\s*plan|protected\s*item|labour|labor|service\s*call|accessory|accessories|haul\s*away)/i;

    // Pages are joined with \n in parsePDF
    const pages = text.split('\n');

    // First: check if ANY page has a MODEL header (confirms this is an invoice)
    const hasHeader = pages.some(p => /MODEL\s*#?\s*DESCRIPTION|MODEL\s*#|MODEL\s+DESC/i.test(p));
    if (!hasHeader) return items;

    // Process EVERY page — not just pages with headers (page 2, 3, 4+ won't repeat the header)
    for (const pageText of pages) {
      // If this page has a header, start scanning after it
      const headerMatch = pageText.match(/MODEL\s*#?\s*DESCRIPTION|MODEL\s*#|MODEL\s+DESC/i);
      const scanText = headerMatch
        ? pageText.substring(headerMatch.index + headerMatch[0].length)
        : pageText;

      // Stop at summary lines on THIS page only
      const stopPattern = /\b(?:SUBTOTAL|SUB\s*TOTAL|TOTAL|SALES\s*TAX|HST|GST|AMOUNT\s*DUE|PROTECTED\s*ITEMS?)\b/i;
      const stopMatch = stopPattern.exec(scanText);
      const itemSection = stopMatch ? scanText.substring(0, stopMatch.index) : scanText;

      // Strategy 1: model token + middle text + price
      const linePattern = /(?:^|\s{2,}|\n)([A-Z]{2,}[A-Z0-9\-\/]*\d[A-Z0-9\-\/]*)\s+(.+?)(\$?\s*[\d,]+\.\d{2})/g;
      let lineMatch;

      while ((lineMatch = linePattern.exec(itemSection)) !== null) {
        const modelCandidate = lineMatch[1].trim();
        const middleText = lineMatch[2].trim();
        const priceStr = lineMatch[3].trim();

        if (!isValidModel(modelCandidate)) continue;
        if (skipPattern.test(middleText) || skipPattern.test(modelCandidate)) continue;
        if (seenModels.has(modelCandidate)) continue;

        const cost = parseFloat(priceStr.replace(/[$,\s]/g, ''));
        if (isNaN(cost) || cost <= 0 || cost < 50) continue;

        seenModels.add(modelCandidate);
        const description = cleanDescription(middleText);

        items.push({
          id: crypto.randomUUID(),
          model: modelCandidate,
          cost,
          isSmall: false,
          description,
          _source: 'Invoice',
        });
      }
    }

    // Strategy 2: fallback if Strategy 1 found nothing on any page
    if (items.length === 0) {
      for (const pageText of pages) {
        const headerMatch = pageText.match(/MODEL\s*#?\s*DESCRIPTION|MODEL\s*#|MODEL\s+DESC/i);
        const scanText = headerMatch
          ? pageText.substring(headerMatch.index + headerMatch[0].length)
          : pageText;

        const stopPattern = /\b(?:SUBTOTAL|SUB\s*TOTAL|TOTAL|SALES\s*TAX|HST|GST|AMOUNT\s*DUE|PROTECTED\s*ITEMS?)\b/i;
        const stopMatch = stopPattern.exec(scanText);
        const itemSection = stopMatch ? scanText.substring(0, stopMatch.index) : scanText;

        const tokenPattern = /\b([A-Z]{2,}[A-Z0-9\-]{2,}\d[A-Z0-9\-]*)\b/g;
        let tokenMatch;

        while ((tokenMatch = tokenPattern.exec(itemSection)) !== null) {
          const model = tokenMatch[1];
          if (!isValidModel(model)) continue;
          if (seenModels.has(model)) continue;

          const afterModel = itemSection.substring(tokenMatch.index + model.length, tokenMatch.index + model.length + 300);
          const priceMatch = afterModel.match(/^(.+?)\$?\s*([\d,]+\.\d{2})/);
          if (!priceMatch) continue;

          const descText = priceMatch[1].trim();
          const cost = parseFloat(priceMatch[2].replace(/,/g, ''));
          if (isNaN(cost) || cost <= 0 || cost < 50) continue;
          if (skipPattern.test(descText)) continue;

          seenModels.add(model);
          const description = cleanDescription(descText);

          items.push({
            id: crypto.randomUUID(),
            model,
            cost,
            isSmall: false,
            description,
            _source: 'Invoice',
          });
        }
      }
    }

    return items;
  }

  /**
   * Fallback generic text parser for PDFs without clear structure.
   */
  function parseGenericText(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    const items = [];

    for (const line of lines) {
      const priceMatch = line.match(/\$?([\d,]+\.?\d*)/);
      if (priceMatch) {
        const cost = parseFloat(priceMatch[1].replace(/,/g, ''));
        const model = line.substring(0, line.indexOf(priceMatch[0])).trim().replace(/[-–—,|]+$/, '').trim();
        if (model && model.length > 2 && !isNaN(cost) && cost > 0) {
          if (/(?:^(?:sub)?total|^tax|^shipping|^delivery|^rebate|^discount)/i.test(model)) continue;
          items.push({
            id: crypto.randomUUID(),
            model,
            cost,
            isSmall: false,
            description: cleanDescription(model + ' ' + line),
            _source: 'PDF',
          });
        }
      }
    }

    return items;
  }

  function parseCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter((l) => l.trim());
        const items = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (i === 0 && /model|description|name|item/i.test(line) && /cost|price|amount/i.test(line)) continue;

          const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
          if (parts.length >= 2) {
            const model = parts[0];
            const costStr = parts.find((p, idx) => idx > 0 && /[\d.]/.test(p.replace(/[$,]/g, '')));
            const cost = costStr ? parseFloat(costStr.replace(/[$,]/g, '')) : NaN;
            const isSmall = parts.some((p) => /small/i.test(p));

            if (model && !isNaN(cost) && cost > 0) {
              items.push({ id: crypto.randomUUID(), model, cost, isSmall, description: '' });
            }
          }
        }

        if (items.length > 0) {
          setParseResults({ success: true, message: `Found ${items.length} appliance(s)`, items });
        } else {
          setParseResults({
            success: false,
            message: 'No valid appliance data found. Expected format: Model, Cost (one per line)',
          });
        }
      } catch {
        setParseResults({ success: false, message: 'Error parsing CSV file' });
      }
    };
    reader.readAsText(file);
  }

  function parseText(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter((l) => l.trim());
        const items = [];

        for (const line of lines) {
          const priceMatch = line.match(/\$?([\d,]+\.?\d*)/);
          if (priceMatch) {
            const cost = parseFloat(priceMatch[1].replace(/,/g, ''));
            const model = line.substring(0, line.indexOf(priceMatch[0])).trim().replace(/[-–—,|]+$/, '').trim();
            const isSmall = /small/i.test(line);

            if (model && !isNaN(cost) && cost > 0) {
              items.push({ id: crypto.randomUUID(), model, cost, isSmall, description: '' });
            }
          }
        }

        if (items.length > 0) {
          setParseResults({ success: true, message: `Found ${items.length} appliance(s)`, items });
        } else {
          setParseResults({
            success: false,
            message: 'No valid appliance data found. Each line should have a description and dollar amount.',
          });
        }
      } catch {
        setParseResults({ success: false, message: 'Error parsing text file' });
      }
    };
    reader.readAsText(file);
  }

  function handleAddAll() {
    if (parseResults?.items) {
      // Clean up internal _source field before passing to parent
      const cleaned = parseResults.items.map(({ _source, ...rest }) => rest);
      onParsedItems(cleaned);
      setParseResults(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveItem(id) {
    if (!parseResults?.items) return;
    const updated = parseResults.items.filter((item) => item.id !== id);
    if (updated.length > 0) {
      setParseResults({ ...parseResults, message: `Found ${updated.length} appliance(s)`, items: updated });
    } else {
      handleClear();
    }
  }

  function handleClear() {
    setParseResults(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="space-y-4">
      <div
        className={`upload-zone ${isDragging ? 'upload-zone-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          // Reset input value so re-selecting the same file triggers onChange
          if (fileInputRef.current) fileInputRef.current.value = '';
          fileInputRef.current?.click();
        }}
      >
        <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.txt,.pdf" onChange={handleFileSelect} />

        <svg className="w-12 h-12 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-400 font-medium">Reading PDF...</p>
          </div>
        ) : (
          <>
            <p className="text-slate-300 font-medium">
              {fileName ? fileName : 'Drop a file here or click to browse'}
            </p>
            <p className="text-slate-500 text-sm mt-1">Supports PDF quotes, invoices, CSV, and TXT files</p>
          </>
        )}
      </div>

      {parseResults && (
        <div
          className={`rounded-xl p-4 border ${
            parseResults.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <p className="font-medium">{parseResults.message}</p>

          {parseResults.items && (
            <div className="mt-3 space-y-1">
              {parseResults.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm py-1.5">
                  <div className="min-w-0 flex-1 mr-3">
                    <span className="text-slate-300 font-medium">{item.model}</span>
                    {item.description && (
                      <span className="text-slate-500 text-xs ml-2">{item.description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono">${item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                      className="p-0.5 hover:bg-red-600/20 rounded text-slate-500 hover:text-red-400 transition-colors"
                      title="Remove item"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex gap-3 mt-4 pt-3 border-t border-emerald-500/20">
                <button onClick={handleAddAll} className="btn-success text-sm py-2">
                  Add All to List
                </button>
                <button onClick={handleClear} className="btn-secondary text-sm py-2">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!parseResults.success && (
            <div className="mt-3">
              <button onClick={handleClear} className="btn-secondary text-sm py-2">
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
