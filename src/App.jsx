import { useState } from 'react';
import ApplianceForm from './components/ApplianceForm';
import ApplianceList from './components/ApplianceList';
import DocumentUpload from './components/DocumentUpload';
import ResultsPanel from './components/ResultsPanel';
import YearSelector from './components/YearSelector';
import { calculateAll } from './utils/calculator';

export default function App() {
  const [appliances, setAppliances] = useState([]);
  const [years, setYears] = useState(3);
  const [results, setResults] = useState(null);
  const [inputMode, setInputMode] = useState('manual');

  function addAppliance(appliance) {
    setAppliances((prev) => [...prev, appliance]);
    setResults(null);
  }

  function removeAppliance(id) {
    setAppliances((prev) => prev.filter((a) => a.id !== id));
    setResults(null);
  }

  function addParsedItems(items) {
    setAppliances((prev) => [...prev, ...items]);
    setResults(null);
  }

  function clearAll() {
    setAppliances([]);
    setResults(null);
  }

  function handleCalculate() {
    if (appliances.length === 0) return;
    const result = calculateAll(appliances, years);
    setResults(result);
  }

  function handleYearChange(newYears) {
    setYears(newYears);
    setResults(null);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Warranty Protection Calculator</h1>
              <p className="text-xs text-slate-500">Warranty List Options 6.0</p>
            </div>
          </div>

          <YearSelector selected={years} onChange={handleYearChange} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Input Section */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-100">Appliances</h2>
              {appliances.length > 0 && (
                <span className="bg-blue-500/20 text-blue-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {appliances.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setInputMode('manual')}
                className={inputMode === 'manual' ? 'tab-button-active' : 'tab-button-inactive'}
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Manual Entry
                </span>
              </button>
              <button
                onClick={() => setInputMode('upload')}
                className={inputMode === 'upload' ? 'tab-button-active' : 'tab-button-inactive'}
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  Upload Document
                </span>
              </button>

              {appliances.length > 0 && (
                <button onClick={clearAll} className="btn-danger text-xs ml-2">
                  Clear All
                </button>
              )}
            </div>
          </div>

          <div className="card-body space-y-6">
            {inputMode === 'manual' ? (
              <ApplianceForm onAdd={addAppliance} />
            ) : (
              <DocumentUpload onParsedItems={addParsedItems} />
            )}

            <ApplianceList appliances={appliances} onRemove={removeAppliance} />
          </div>
        </div>

        {/* Calculate Button */}
        <div className="flex justify-center">
          <button
            onClick={handleCalculate}
            disabled={appliances.length === 0}
            className="btn-primary text-lg px-10 py-4 flex items-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            Calculate Warranty Pricing
          </button>
        </div>

        {/* Results */}
        {results && (
          <div className="card">
            <div className="card-body">
              <ResultsPanel results={results} />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800/50 mt-12 py-6">
        <p className="text-center text-slate-600 text-sm">Warranty List Options 6.0 — Protection Plan Calculator</p>
      </footer>
    </div>
  );
}
