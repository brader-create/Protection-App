import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const APPLIANCE_TYPES = [
  ['refrigerat', 'Refrigerator'], ['fridge', 'Refrigerator'], ['freezer', 'Freezer'],
  ['washer', 'Washer'], ['washing', 'Washer'], ['laundry', 'Laundry'],
  ['dryer', 'Dryer'],
  ['dishwasher', 'Dishwasher'],
  ['range', 'Range'], ['stove', 'Range'], ['oven', 'Oven'], ['cooktop', 'Cooktop'],
  ['microwave', 'Microwave'],
  ['hood', 'Hood'], ['ventilat', 'Ventilation'],
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
];

function cleanDescription(rawDesc) {
  if (!rawDesc) return '';
  const lower = rawDesc.toLowerCase();

  let brand = '';
  for (const b of BRANDS) {
    if (lower.includes(b.toLowerCase())) {
      brand = b;
      break;
    }
  }

  let type = '';
  for (const [keyword, label] of APPLIANCE_TYPES) {
    if (lower.includes(keyword)) {
      type = label;
      break;
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
   * Also extracts a brief description from the text before the parenthesized model.
   */
  function parseQuoteText(text) {
    const items = [];

    const modelPattern = /\(([A-Z0-9][A-Z0-9\-\/]+[A-Z0-9])\)/g;
    let match;
    const modelPositions = [];

    while ((match = modelPattern.exec(text)) !== null) {
      // Capture raw description: text before this model's parentheses
      const descStart = modelPositions.length > 0
        ? modelPositions[modelPositions.length - 1].index
        : Math.max(0, match.index - 150);
      const rawDesc = text.substring(descStart, match.index).trim();

      // Extract just brand + appliance type
      const description = cleanDescription(rawDesc);

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
   * Detect item table by "MODEL" header, parse lines starting with uppercase model token,
   * capture first token as model and last dollar amount as price.
   * Description is cleaned to brand + appliance type only.
   */
  function parseInvoiceText(text) {
    const items = [];

    // Find the header line containing MODEL
    const headerMatch = text.match(/MODEL\s*#?\s*DESCRIPTION|MODEL\s*#|MODEL\s+DESC/i);
    if (!headerMatch) return items;

    // Get everything after the header
    const afterHeader = text.substring(headerMatch.index + headerMatch[0].length);

    // Stop keywords — everything after these is not appliance data
    const stopPattern = /\b(?:SUBTOTAL|SUB\s*TOTAL|TOTAL|SALES\s*TAX|HST|GST|AMOUNT\s*DUE|PROTECTED\s*ITEMS?)\b/i;
    const stopMatch = stopPattern.exec(afterHeader);
    const itemSection = stopMatch ? afterHeader.substring(0, stopMatch.index) : afterHeader;

    // Skip patterns for non-appliance lines
    const skipPattern = /(?:delivery|install|hose\s*kit|bracket|connector|cpp|protection\s*plan|protected\s*item|labour|labor|service\s*call|accessory|accessories|haul\s*away)/i;

    // Strategy 1: Look for model-number tokens followed by description and a price
    // Model pattern: starts with 2+ letters, has digits, 5-20 chars total
    const linePattern = /(?:^|\s{2,}|\n)([A-Z]{2,}[A-Z0-9\-\/]*\d[A-Z0-9\-\/]*)\s+(.+?)(\$?\s*[\d,]+\.\d{2})/g;
    let lineMatch;

    while ((lineMatch = linePattern.exec(itemSection)) !== null) {
      const modelCandidate = lineMatch[1].trim();
      const middleText = lineMatch[2].trim();
      const priceStr = lineMatch[3].trim();

      if (!isValidModel(modelCandidate)) continue;
      if (skipPattern.test(middleText) || skipPattern.test(modelCandidate)) continue;

      const cost = parseFloat(priceStr.replace(/[$,\s]/g, ''));
      if (isNaN(cost) || cost <= 0 || cost < 50) continue; // Skip tiny amounts (likely accessories)

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

    // Strategy 2: If regex approach found nothing, try splitting by potential model tokens
    if (items.length === 0) {
      // Look for tokens that match appliance model patterns
      const tokenPattern = /\b([A-Z]{2,}[A-Z0-9\-]{2,}\d[A-Z0-9\-]*)\b/g;
      let tokenMatch;

      while ((tokenMatch = tokenPattern.exec(itemSection)) !== null) {
        const model = tokenMatch[1];
        if (!isValidModel(model)) continue;

        // Look for the nearest price after this model
        const afterModel = itemSection.substring(tokenMatch.index + model.length, tokenMatch.index + model.length + 300);

        // Get description text between model and price
        const priceMatch = afterModel.match(/^(.+?)\$?\s*([\d,]+\.\d{2})/);
        if (!priceMatch) continue;

        const descText = priceMatch[1].trim();
        const cost = parseFloat(priceMatch[2].replace(/,/g, ''));
        if (isNaN(cost) || cost <= 0 || cost < 50) continue;
        if (skipPattern.test(descText)) continue;

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
