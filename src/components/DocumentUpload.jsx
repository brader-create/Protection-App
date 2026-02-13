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

      const items = parseQuoteText(fullText);

      if (items.length > 0) {
        setParseResults({ success: true, message: `Found ${items.length} appliance(s) from PDF`, items });
      } else {
        // Fallback: try generic text parsing
        const fallbackItems = parseGenericText(fullText);
        if (fallbackItems.length > 0) {
          setParseResults({ success: true, message: `Found ${fallbackItems.length} appliance(s) from PDF`, items: fallbackItems });
        } else {
          setParseResults({
            success: false,
            message: 'No appliance data found in PDF. Try a quote with model numbers in parentheses and prices.',
          });
        }
      }
    } catch {
      setParseResults({ success: false, message: 'Error reading PDF file. Please try a different file.' });
    }
    setLoading(false);
  }

  /**
   * Parse quote-style PDFs: find model numbers in parentheses and their "Your Price".
   * Looks for pattern: description with (MODEL-NUMBER) followed by dollar amounts,
   * takes the first dollar amount as "Your Price".
   */
  function parseQuoteText(text) {
    const items = [];

    // Find all model numbers in parentheses with nearby prices
    // Pattern: text containing (MODEL) ... $price
    const modelPattern = /\(([A-Z0-9][A-Z0-9\-\/]+[A-Z0-9])\)/g;
    let match;
    const modelPositions = [];

    while ((match = modelPattern.exec(text)) !== null) {
      modelPositions.push({ model: match[1], index: match.index + match[0].length });
    }

    for (let i = 0; i < modelPositions.length; i++) {
      const { model, index } = modelPositions[i];
      // Look for dollar amounts after the model number, up to the next model or 200 chars
      const endIndex = i + 1 < modelPositions.length
        ? modelPositions[i + 1].index
        : index + 200;
      const searchText = text.substring(index, Math.min(endIndex, text.length));

      // Find the first dollar amount (Your Price)
      const priceMatch = searchText.match(/\$\s*([\d,]+\.\d{2})/);
      if (priceMatch) {
        const cost = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(cost) && cost > 0) {
          // Skip if this looks like a tax, rebate, or subtotal amount
          const contextBefore = text.substring(Math.max(0, index - 50), index).toLowerCase();
          if (/(?:tax|rebate|discount|subtotal|total|shipping|delivery)/i.test(contextBefore)) continue;

          items.push({
            id: crypto.randomUUID(),
            model,
            cost,
            isSmall: false,
          });
        }
      }
    }

    return items;
  }

  /**
   * Fallback generic text parser for PDFs without parenthesized model numbers.
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
          // Skip lines that look like totals/taxes
          if (/(?:^(?:sub)?total|^tax|^shipping|^delivery|^rebate|^discount)/i.test(model)) continue;
          items.push({
            id: crypto.randomUUID(),
            model,
            cost,
            isSmall: false,
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
              items.push({ id: crypto.randomUUID(), model, cost, isSmall });
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
              items.push({ id: crypto.randomUUID(), model, cost, isSmall });
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
      onParsedItems(parseResults.items);
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
            <p className="text-slate-500 text-sm mt-1">Supports PDF, CSV, and TXT files (quotes, invoices, lists)</p>
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
                <div key={item.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-300">{item.model}</span>
                  <div className="flex items-center gap-2">
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
