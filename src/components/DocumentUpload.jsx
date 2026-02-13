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
  ['microwave', 'Microwave'],
  ['hoodfan', 'Hood Fan'], ['hood', 'Hood'], ['ventilat', 'Ventilation'],
  ['compactor', 'Compactor'],
  ['ice maker', 'Ice Maker'],
  ['wine', 'Wine Cooler'], ['beverage', 'Beverage Center'],
  ['air cond', 'Air Conditioner'],
  ['dehumid', 'Dehumidifier'], ['humidif', 'Humidifier'],
  ['water heater', 'Water Heater'],
  ['dispos', 'Disposal'],
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

  let type = '';
  for (const [keyword, label] of APPLIANCE_TYPES) {
    if (lower.includes(keyword)) {
      type = label;
      break;
    }
  }

  // For invoice descriptions with "HOODFAN" style keywords, also check without spaces
  if (!type) {
    const noSpaceLower = lower.replace(/[\s,\/]+/g, '');
    for (const [keyword, label] of APPLIANCE_TYPES) {
      if (noSpaceLower.includes(keyword.replace(/\s/g, ''))) {
        type = label;
        break;
      }
    }
  }

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
   * Parse quote-style PDFs: find model numbers in parentheses and their "Your Price".
   * Descriptions are comma-separated like "KitchenAid, Range, Induction" — pull brand + type from commas.
   */
  function parseQuoteText(text) {
    const items = [];

    const modelPattern = /\(([A-Z0-9][A-Z0-9\-\/]+[A-Z0-9])\)/g;
    let match;
    const modelPositions = [];

    while ((match = modelPattern.exec(text)) !== null) {
      // Grab text before this model's parentheses (up to 200 chars back)
      const descStart = modelPositions.length > 0
        ? modelPositions[modelPositions.length - 1].index
        : Math.max(0, match.index - 200);
      const rawDesc = text.substring(descStart, match.index).trim();

      // Look for comma-separated description like "KitchenAid, Range, Induction" or "KitchenAid, D/W, SS"
      // Find the last comma-separated chunk in the raw text before the model
      const commaMatch = rawDesc.match(/([A-Za-z][A-Za-z&\s\-]+(?:,\s*[A-Za-z][A-Za-z0-9&\s\/\-]*)+)\s*$/);
      let description = '';
      if (commaMatch) {
        const parts = commaMatch[1].split(',').map(p => p.trim()).filter(Boolean);
        // First part = brand, second part = type
        const brand = parts[0] || '';
        const typeRaw = parts[1] || '';
        // Clean up type through APPLIANCE_TYPES lookup
        let type = '';
        const typeLower = typeRaw.toLowerCase();
        for (const [keyword, label] of APPLIANCE_TYPES) {
          if (typeLower.includes(keyword)) {
            type = label;
            break;
          }
        }
        // If no match in lookup, use the raw type as-is (e.g. "D/W" -> "D/W")
        if (!type && typeRaw) type = typeRaw;
        if (brand && type) description = `${brand} - ${type}`;
        else if (brand) description = brand;
      } else {
        description = cleanDescription(rawDesc);
      }

      modelPositions.push({ model: match[1], index: match.index + match[0].length, description });
    }

    for (let i = 0; i < modelPositions.length; i++) {
      const { model, index, description } = modelPositions[i];
      const endIndex = i + 1 < modelPositions.length
        ? modelPositions[i + 1].index
        : index + 200;
      const searchText = text.substring(index, Math.min(endIndex, text.length));

      const priceMatch = searchText.match(/\$\s*([\d,]+\.\d{2})/);
      if (priceMatch) {
        const cost = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(cost) && cost > 0) {
          const contextBefore = text.substring(Math.max(0, index - 50), index).toLowerCase();
          if (/(?:tax|rebate|discount|subtotal|total|shipping|delivery)/i.test(contextBefore)) continue;

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
    }

    return items;
  }

  /**
   * Parse invoice-style PDFs.
   * Simple approach: find every price (0000.00), check left for warehouse code (XX99),
   * then check for model at start of that segment. No warehouse + model = skip.
   */
  function parseInvoiceText(text) {
    const items = [];
    const seenModels = new Set();

    // Scan for standalone prices: must have a dot with exactly 2 decimal digits
    // Must be preceded by whitespace (or start) and followed by whitespace (or end)
    // This avoids matching account numbers, dates, or other digit strings
    const pricePattern = /(?<=\s|^)(\d{1,3}(?:,?\d{3})*\.\d{2})(?=\s|$)/g;
    let priceMatch;

    while ((priceMatch = pricePattern.exec(text)) !== null) {
      const priceStr = priceMatch[1];
      // Extra safety: must contain a dot (real price like 1585.98, not 5207585)
      if (!priceStr.includes('.')) continue;
      const cost = parseFloat(priceStr.replace(/,/g, ''));
      if (isNaN(cost) || cost < 50) continue;

      // Grab the text before this price (up to 300 chars back)
      const startPos = Math.max(0, priceMatch.index - 300);
      const beforePrice = text.substring(startPos, priceMatch.index).trim();

      // Must have a warehouse code (XX99 like IE27, AB12) right before the price
      // Pattern: warehouse code, then spaces, then we're at the price
      const warehouseMatch = beforePrice.match(/([A-Z]{2}\d{2})\s*$/);
      if (!warehouseMatch) continue;

      // Get everything before the warehouse code
      const beforeWarehouse = beforePrice.substring(0, warehouseMatch.index).trim();

      // Strip trailing qty digit(s) — the qty sits between description and warehouse
      const beforeQty = beforeWarehouse.replace(/\s+\d+\s*$/, '').trim();
      if (!beforeQty) continue;

      // Now find the model: work backwards to find the start of this "line"
      // A previous price ending marks the boundary of the previous item
      // Look for the last price-like pattern in beforeQty to find where this line starts
      let lineText = beforeQty;
      const prevBoundary = beforeQty.match(/.*\d+\.\d{2}\s+/);
      if (prevBoundary) {
        lineText = beforeQty.substring(prevBoundary[0].length);
      }

      // Also skip past "ORDERED" text that follows table headers
      const orderedIdx = lineText.lastIndexOf('ORDERED');
      if (orderedIdx >= 0) {
        lineText = lineText.substring(orderedIdx + 7).trim();
      }

      lineText = lineText.trim();
      if (!lineText) continue;

      // First token is the model
      const tokens = lineText.split(/\s+/);
      const modelCandidate = tokens[0];

      // Must be a valid model number
      if (!isValidModel(modelCandidate)) continue;

      // Skip duplicates
      if (seenModels.has(modelCandidate)) continue;
      seenModels.add(modelCandidate);

      // Description is everything between model and qty/warehouse
      const descText = tokens.slice(1).join(' ').trim();

      // Skip services/accessories by description
      if (/(?:delivery|install|hose\s*kit|bracket|connector|cpp|protection\s*plan|labour|labor|service\s*call|haul\s*away)/i.test(descText)) continue;

      const description = cleanDescription(descText);

      items.push({
        id: crypto.randomUUID(),
        model: modelCandidate,
        cost,
        isSmall: false,
        description,
        _source: 'Invoice',
      });
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
        onClick={() => fileInputRef.current?.click()}
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
