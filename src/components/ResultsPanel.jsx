import { useState } from 'react';
import { WARRANTY_YEARS } from '../data/warrantyPricing';
import { generateComparisonPDF } from '../utils/pdfExport';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ResultCard({ result, cheapestPrice, originalResult, save3Active }) {
  const isBest = result.isCheapest && result.valid;
  const savings =
    result.valid && cheapestPrice !== null && result.total !== cheapestPrice
      ? result.total - cheapestPrice
      : null;

  const warrantySaved =
    save3Active && originalResult?.valid && result.valid
      ? originalResult.total - result.total
      : null;

  return (
    <div className={`result-card ${isBest ? 'result-card-best border-emerald-500/40' : ''}`}>
      {isBest && (
        <div className="absolute top-3 right-3">
          <span className="badge-emerald flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Best Price
          </span>
        </div>
      )}

      <h3 className="text-lg font-bold text-slate-100 mb-1">{result.label}</h3>

      {result.valid ? (
        <>
          <div className={`price-tag ${isBest ? 'text-emerald-400' : 'text-slate-100'} mb-4`}>
            {formatPrice(result.total)}
          </div>

          {savings !== null && (
            <p className="text-sm text-red-400 mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              {formatPrice(savings)} more than best
            </p>
          )}

          {warrantySaved !== null && warrantySaved > 0 && (
            <p className="text-sm text-amber-400 mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Save {formatPrice(warrantySaved)} on warranty with 3%
            </p>
          )}

          <div className="space-y-3">
            {result.items.map((item, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  {item.groupLabel !== '1 Appliance' && (
                    <span className="badge-blue text-[10px]">{item.groupLabel}</span>
                  )}
                  <span className="text-sm font-semibold text-slate-200 tabular-nums ml-auto">
                    {formatPrice(item.price)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {item.appliances.map((app, j) => (
                    <div key={j} className="flex items-center justify-between text-xs text-slate-400">
                      <span className="truncate mr-2">{app.model}</span>
                      <span className="tabular-nums shrink-0">
                        ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
                {item.bracket && (
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Bracket: ${item.bracket.min.toLocaleString()} – ${item.bracket.max.toLocaleString()}
                    {item.appliances.length > 1 && (
                      <span className="ml-1">(combined: ${item.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-slate-500">
          <p className="text-sm mb-2">Not available for this combination</p>
          {result.items
            .filter((item) => item.error)
            .map((item, i) => (
              <p key={i} className="text-xs text-red-400/70">
                {item.error}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

export default function ResultsPanel({ allResults, activeYear, onYearChange, appliances, save3Active }) {
  const [generating, setGenerating] = useState(false);

  if (!allResults) return null;

  const { byYear, originalByYear, productSavings } = allResults;
  const results = byYear[activeYear];
  if (!results) return null;

  const { bestMix, singleBundle, individual, cheapestPrice } = results;
  const originalResults = originalByYear ? originalByYear[activeYear] : null;

  // Compute total savings when save 3% is active
  const warrantySaved =
    save3Active && originalResults?.cheapestPrice !== null && cheapestPrice !== null
      ? originalResults.cheapestPrice - cheapestPrice
      : 0;
  const totalSaved = (productSavings || 0) + (warrantySaved > 0 ? warrantySaved : 0);

  function handleDownloadPDF() {
    setGenerating(true);
    setTimeout(() => {
      try {
        generateComparisonPDF(appliances);
      } catch (err) {
        console.error('PDF generation error:', err);
      }
      setGenerating(false);
    }, 50);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-100">Warranty Pricing Comparison</h2>
        <div className="flex items-center gap-3">
          {appliances && appliances.length > 0 && (
            <button
              onClick={handleDownloadPDF}
              disabled={generating}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-300 rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Year Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-700/50 rounded-xl p-1 w-fit">
        {WARRANTY_YEARS.map((yr) => {
          const yearResult = byYear[yr];
          const isActive = yr === activeYear;
          const yearBest = yearResult?.cheapestPrice;
          return (
            <button
              key={yr}
              onClick={() => onYearChange(yr)}
              className={`relative px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span className="block">{yr}-Year</span>
              {yearBest !== null && yearBest !== undefined && (
                <span className={`block text-xs mt-0.5 tabular-nums ${isActive ? 'text-blue-200' : 'text-slate-500'}`}>
                  {formatPrice(yearBest)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Save 3% Savings Banner */}
      {save3Active && totalSaved > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-amber-300/70">Save 3% Total Savings</p>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{formatPrice(totalSaved)}</p>
              <div className="flex gap-4 mt-1 text-xs text-amber-300/50">
                {productSavings > 0 && <span>Product: {formatPrice(productSavings)}</span>}
                {warrantySaved > 0 && <span>Warranty: {formatPrice(warrantySaved)}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Best Price Banner */}
      {cheapestPrice !== null && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-emerald-300/70">Lowest Available Price ({activeYear}-Year)</p>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatPrice(cheapestPrice)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ResultCard
          result={bestMix}
          cheapestPrice={cheapestPrice}
          originalResult={originalResults?.bestMix}
          save3Active={save3Active}
        />
        <ResultCard
          result={singleBundle}
          cheapestPrice={cheapestPrice}
          originalResult={originalResults?.singleBundle}
          save3Active={save3Active}
        />
        <ResultCard
          result={individual}
          cheapestPrice={cheapestPrice}
          originalResult={originalResults?.individual}
          save3Active={save3Active}
        />
      </div>
    </div>
  );
}
