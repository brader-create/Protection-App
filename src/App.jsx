import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ApplianceForm from './components/ApplianceForm';
import ApplianceList from './components/ApplianceList';
import DocumentUpload from './components/DocumentUpload';
import ResultsPanel from './components/ResultsPanel';
import { calculateAll } from './utils/calculator';
import { WARRANTY_YEARS } from './data/warrantyPricing';

export default function App() {
  const [appliances, setAppliances] = useState([]);
  const [activeYear, setActiveYear] = useState(4);
  const [inputMode, setInputMode] = useState('manual');
  const [calculating, setCalculating] = useState(false);
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [save3Active, setSave3Active] = useState(false);
  const [save3Exclusions, setSave3Exclusions] = useState(new Set());

  // Progressive results: built year-by-year
  const [normalByYear, setNormalByYear] = useState({});
  const [save3ByYear, setSave3ByYear] = useState({});
  const [save3OrigByYear, setSave3OrigByYear] = useState({});
  const [productSavings, setProductSavings] = useState(0);
  const [precomputing, setPrecomputing] = useState(false);
  const [hasResults, setHasResults] = useState(false);

  const calcIdRef = useRef(0);

  // Derive the displayed allResults from state
  const allResults = useMemo(() => {
    const byYear = save3Active ? save3ByYear : normalByYear;
    if (Object.keys(byYear).length === 0) return null;
    return {
      byYear,
      originalByYear: save3Active && Object.keys(save3OrigByYear).length > 0 ? save3OrigByYear : null,
      productSavings: save3Active ? productSavings : 0,
    };
  }, [normalByYear, save3ByYear, save3OrigByYear, save3Active, productSavings]);

  function clearResults() {
    setNormalByYear({});
    setSave3ByYear({});
    setSave3OrigByYear({});
    setProductSavings(0);
    setHasResults(false);
  }

  function addAppliance(appliance) {
    setAppliances((prev) => [...prev, appliance]);
    clearResults();
  }

  function removeAppliance(id) {
    setAppliances((prev) => prev.filter((a) => a.id !== id));
    setExcludedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setSave3Exclusions((prev) => { const n = new Set(prev); n.delete(id); return n; });
    clearResults();
  }

  function updateAppliance(id, updates) {
    setAppliances((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    clearResults();
  }

  function addParsedItems(items) {
    setAppliances((prev) => [...prev, ...items]);
    clearResults();
  }

  function clearAll() {
    setAppliances([]);
    setExcludedIds(new Set());
    setSave3Exclusions(new Set());
    clearResults();
  }

  function toggleAppliance(id) {
    setExcludedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    clearResults();
  }

  // Refs for accessing latest state in async callbacks
  const appliancesRef = useRef(appliances);
  const excludedIdsRef = useRef(excludedIds);
  const save3ActiveRef = useRef(save3Active);
  const save3ExclusionsRef = useRef(save3Exclusions);
  useEffect(() => { appliancesRef.current = appliances; }, [appliances]);
  useEffect(() => { excludedIdsRef.current = excludedIds; }, [excludedIds]);
  useEffect(() => { save3ActiveRef.current = save3Active; }, [save3Active]);
  useEffect(() => { save3ExclusionsRef.current = save3Exclusions; }, [save3Exclusions]);

  // Progressive calculation: one year at a time (4→3→2)
  const runProgressiveCalc = useCallback((opts = {}) => {
    const { forSave3 = false, pregenerate = false } = opts;
    const apps = appliancesRef.current;
    const excluded = excludedIdsRef.current;
    const s3Exclusions = save3ExclusionsRef.current;

    const active = apps.filter((a) => !excluded.has(a.id));
    if (active.length === 0) return;

    const id = ++calcIdRef.current;

    if (!pregenerate) {
      setCalculating(true);
      if (forSave3) {
        setSave3ByYear({});
        setSave3OrigByYear({});
      } else {
        setNormalByYear({});
      }
    } else {
      setPrecomputing(true);
    }

    const prepared = forSave3 || pregenerate
      ? active.map((a) => {
          const discounted = pregenerate || !s3Exclusions.has(a.id);
          return {
            ...a,
            originalCost: a.cost,
            cost: discounted ? Math.round(a.cost * 0.97 * 100) / 100 : a.cost,
          };
        })
      : active;

    if (forSave3 || pregenerate) {
      const origTotal = active.reduce((s, a) => s + a.cost, 0);
      const discTotal = prepared.reduce((s, a) => s + a.cost, 0);
      setProductSavings(origTotal - discTotal);
    }

    const years = [4, 3, 2];
    let idx = 0;

    function computeNext() {
      if (calcIdRef.current !== id) return; // cancelled
      if (idx >= years.length) {
        if (!pregenerate) {
          setCalculating(false);
          setHasResults(true);
          // After normal calc done, pre-generate 3% in background
          if (!forSave3) {
            runProgressiveCalc({ pregenerate: true });
          }
        } else {
          setPrecomputing(false);
        }
        return;
      }

      const yr = years[idx];
      const result = calculateAll(prepared, yr);

      if (forSave3 || pregenerate) {
        if (pregenerate) {
          setSave3ByYear((prev) => ({ ...prev, [yr]: result }));
        } else {
          setSave3ByYear((prev) => ({ ...prev, [yr]: result }));
        }
        const origResult = calculateAll(active, yr);
        setSave3OrigByYear((prev) => ({ ...prev, [yr]: origResult }));
      } else {
        setNormalByYear((prev) => ({ ...prev, [yr]: result }));
      }

      idx++;
      setTimeout(computeNext, 15);
    }

    setTimeout(computeNext, 15);
  }, []);

  function handleCalculate() {
    const active = appliances.filter((a) => !excludedIds.has(a.id));
    if (active.length === 0) return;

    clearResults();
    setActiveYear(4);

    if (save3Active) {
      runProgressiveCalc({ forSave3: true });
    } else {
      runProgressiveCalc({ forSave3: false });
    }
  }

  // Auto-recalculate when save3 toggles (if results exist)
  function toggleSave3() {
    const wasActive = save3Active;
    const nowActive = !wasActive;
    setSave3Active(nowActive);
    setSave3Exclusions(new Set());

    if (hasResults || Object.keys(normalByYear).length > 0) {
      if (nowActive) {
        // Check if we have pre-computed 3% cache ready
        if (Object.keys(save3ByYear).length === 3) {
          // Cache is ready — just switch display (useMemo handles it)
          return;
        }
        // Need to compute — will be triggered by effect below
      }
      // Turning off — normalByYear is already there, useMemo switches instantly
    }
  }

  // Auto-recalculate when save3 per-item exclusion changes
  function toggleSave3ForItem(id) {
    setSave3Exclusions((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    // Need to recompute save3 results with new exclusions
    if (hasResults && save3Active) {
      // Small delay to let state update
      setTimeout(() => {
        runProgressiveCalc({ forSave3: true });
      }, 20);
    }
  }

  // Auto-recalculate when save3 is turned on and no cache exists
  useEffect(() => {
    if (save3Active && hasResults && Object.keys(save3ByYear).length < 3 && !calculating) {
      runProgressiveCalc({ forSave3: true });
    }
  }, [save3Active, hasResults, calculating, runProgressiveCalc]);

  const activeCount = appliances.filter((a) => !excludedIds.has(a.id)).length;

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
                  {excludedIds.size > 0 ? `${activeCount}/${appliances.length}` : appliances.length}
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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

            <ApplianceList
              appliances={appliances}
              onRemove={removeAppliance}
              onUpdate={updateAppliance}
              excludedIds={excludedIds}
              onToggle={toggleAppliance}
              save3Active={save3Active}
              save3Exclusions={save3Exclusions}
              onToggle3={toggleSave3ForItem}
            />
          </div>
        </div>

        {/* Save 3% + Calculate */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2.5 cursor-pointer select-none bg-slate-900/80 border border-slate-700/50 rounded-xl px-5 py-2.5 hover:bg-slate-800/80 transition-all">
              <input
                type="checkbox"
                checked={save3Active}
                onChange={toggleSave3}
                className="w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500/50 bg-slate-700 cursor-pointer accent-amber-500"
              />
              <span className={`text-sm font-medium ${save3Active ? 'text-amber-300' : 'text-slate-400'}`}>
                Save 3%
              </span>
              {save3Active && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  ON
                </span>
              )}
              {precomputing && !save3Active && (
                <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" title="Pre-generating 3% results..." />
              )}
            </label>
          </div>

          <button
            onClick={handleCalculate}
            disabled={activeCount === 0 || calculating}
            className="btn-primary text-lg px-10 py-4 flex items-center gap-3"
          >
            {calculating ? (
              <>
                <div className="w-6 h-6 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Calculate All Plans
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {allResults && (
          <div className="card">
            <div className="card-body">
              <ResultsPanel
                allResults={allResults}
                activeYear={activeYear}
                onYearChange={setActiveYear}
                appliances={appliances.filter((a) => !excludedIds.has(a.id))}
                save3Active={save3Active}
                calculating={calculating}
              />
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
