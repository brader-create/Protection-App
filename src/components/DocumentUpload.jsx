import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

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
      // Capture description: text between previous model (or start) and this match
      const descStart = modelPositions.length > 0
        ? modelPositions[modelPositions.length - 1].index
        : Math.max(0, match.index - 150);
      const rawDesc = text.substring(descStart, match.index).trim();

      // Clean up description: take last meaningful segment (after last delimiter/line break)
      let description = '';
      const descLines = rawDesc.split(/[\n\r]+/);
      const lastLine = descLines[descLines.length - 1].trim();
      // Remove leading numbers, bullets, quantities
      const cleaned = lastLine.replace(/^[\d.)\-•*\s]+/, '').replace(/\s{2,}/g, ' ').trim();
      // Only keep if it looks like a product description (has letters, reasonable length)
      if (cleaned.length > 3 && cleaned.length < 120 && /[a-zA-Z]/.test(cleaned)) {
        description = cleaned;
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
   * Detect item table by "MODEL" header, parse lines starting with uppercase model token,
   * capture first token as model and last dollar amount as price.
   * Description is the text between model and price.
   */
  function parseInvoiceText(text) {
    const items = [];

    // Find the header line containing MODEL
    const headerMatch = text.match(/MODEL\s*#?\s*DESCRIPTION|MODEL\s*#|MODEL\s+DESC/i);
    if (!headerMatch) return items;

    // Get everything after the header
    const afterHeader = text.substring(headerMatch.index + headerMatch[0].length);

    // Split into rough lines by looking for patterns
    // PDF text extraction joins everything with spaces, so we look for model-number patterns
    // A model number starts with uppercase letters/digits at a "line start" position
    const linePattern = /(?:^|\s{2,})([A-Z][A-Z0-9]{2,}[A-Z0-9\-\/]*[A-Z0-9])\s+(.+?)(\$?\s*[\d,]+\.\d{2})/g;
    let lineMatch;

    while ((lineMatch = linePattern.exec(afterHeader)) !== null) {
      const fullMatch = lineMatch[0].toLowerCase();
      // Stop at subtotal/total/tax lines
      if (/subtotal|sub\s*total|^total|sales\s*tax|hst|gst|amount\s*due/i.test(fullMatch)) break;

      const modelCandidate = lineMatch[1].trim();
      const middleText = lineMatch[2].trim();
      const priceStr = lineMatch[3].trim();

      // Skip non-appliance lines (delivery, protection plans, accessories, hose kits)
      if (/(?:delivery|install|hose|kit|bracket|connector|cpp|protection\s*plan|protected\s*item|labour|labor|service)/i.test(middleText)) continue;
      if (/(?:delivery|install|hose|kit|bracket|connector|cpp|protection\s*plan|protected\s*item)/i.test(modelCandidate)) continue;

      // Model must be at least 4 chars and contain a digit
      if (modelCandidate.length < 4 || !/\d/.test(modelCandidate)) continue;

      const cost = parseFloat(priceStr.replace(/[$,\s]/g, ''));
      if (isNaN(cost) || cost <= 0) continue;

      // Extract description: brand and product type from middle text
      let description = middleText
        .replace(/\$[\d,]+\.\d{2}/g, '') // remove any extra prices
        .replace(/\s*\d+\s*$/, '') // remove trailing quantity
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Cap description length
      if (description.length > 100) {
        description = description.substring(0, 100).trim();
      }

      items.push({
        id: crypto.randomUUID(),
        model: modelCandidate,
        cost,
        isSmall: false,
        description,
        _source: 'Invoice',
      });
    }

    // If regex approach found nothing, try a simpler line-by-line split approach
    if (items.length === 0) {
      const segments = afterHeader.split(/(?=(?:^|\s{2,})[A-Z][A-Z0-9]{3,})/);
      for (const seg of segments) {
        const trimmed = seg.trim();
        if (!trimmed) continue;

        // Stop conditions
        if (/^(?:SUBTOTAL|TOTAL|TAX|HST|GST|AMOUNT)/i.test(trimmed)) break;

        // Try to extract: MODEL_TOKEN description... price
        const segMatch = trimmed.match(/^([A-Z][A-Z0-9\-\/]{3,}[A-Z0-9])\s+(.+?)\s+\$?\s*([\d,]+\.\d{2})/);
        if (!segMatch) continue;

        const model = segMatch[1];
        const desc = segMatch[2].replace(/\$[\d,]+\.\d{2}/g, '').replace(/\s{2,}/g, ' ').trim();
        const cost = parseFloat(segMatch[3].replace(/,/g, ''));

        if (!/\d/.test(model) || model.length < 4) continue;
        if (isNaN(cost) || cost <= 0) continue;
        if (/(?:delivery|install|hose|kit|bracket|connector|cpp|protection|labour|labor)/i.test(desc)) continue;

        let description = desc;
        if (description.length > 100) description = description.substring(0, 100).trim();

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
            description: '',
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
