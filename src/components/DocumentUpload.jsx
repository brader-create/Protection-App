import { useState, useRef } from 'react';

export default function DocumentUpload({ onParsedItems }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [parseResults, setParseResults] = useState(null);
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

    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      parseCSV(file);
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      parseText(file);
    } else {
      setParseResults({
        success: false,
        message: 'Supported formats: CSV (.csv) or Text (.txt). Each line should have a model/description and a cost.',
      });
    }
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
          // Skip header row if detected
          if (i === 0 && /model|description|name|item/i.test(line) && /cost|price|amount/i.test(line)) continue;

          const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
          if (parts.length >= 2) {
            const model = parts[0];
            const costStr = parts.find((p, idx) => idx > 0 && /[\d.]/.test(p.replace(/[$,]/g, '')));
            const cost = costStr ? parseFloat(costStr.replace(/[$,]/g, '')) : NaN;
            const isSmall = parts.some((p) => /small/i.test(p));

            if (model && !isNaN(cost) && cost > 0) {
              items.push({
                id: crypto.randomUUID(),
                model,
                cost,
                isSmall,
              });
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
          // Try to extract a model name and a dollar amount from each line
          const priceMatch = line.match(/\$?([\d,]+\.?\d*)/);
          if (priceMatch) {
            const cost = parseFloat(priceMatch[1].replace(/,/g, ''));
            // Everything before the price is the model name
            const model = line.substring(0, line.indexOf(priceMatch[0])).trim().replace(/[-–—,|]+$/, '').trim();
            const isSmall = /small/i.test(line);

            if (model && !isNaN(cost) && cost > 0) {
              items.push({
                id: crypto.randomUUID(),
                model,
                cost,
                isSmall,
              });
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
        <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.txt" onChange={handleFileSelect} />

        <svg className="w-12 h-12 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <p className="text-slate-300 font-medium">
          {fileName ? fileName : 'Drop a file here or click to browse'}
        </p>
        <p className="text-slate-500 text-sm mt-1">Supports CSV and TXT files (quotes, invoices, lists)</p>
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
              {parseResults.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-300">{item.model}</span>
                  <span className="font-mono">${item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
