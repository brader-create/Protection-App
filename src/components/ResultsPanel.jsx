import { GROUP_LABELS } from '../data/warrantyPricing';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ResultCard({ result, cheapestPrice }) {
  const isBest = result.isCheapest && result.valid;
  const savings =
    result.valid && cheapestPrice !== null && result.total !== cheapestPrice
      ? result.total - cheapestPrice
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

          <div className="space-y-3">
            {result.items.map((item, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge-blue text-[10px]">{item.groupLabel}</span>
                  <span className="text-sm font-semibold text-slate-200 tabular-nums">
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

export default function ResultsPanel({ results }) {
  if (!results) return null;

  const { bestMix, singleBundle, individual, cheapestPrice, years } = results;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Warranty Pricing Comparison</h2>
        <span className="badge-purple">{years}-Year Coverage</span>
      </div>

      {cheapestPrice !== null && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-emerald-300/70">Lowest Available Price</p>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatPrice(cheapestPrice)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ResultCard result={bestMix} cheapestPrice={cheapestPrice} />
        <ResultCard result={singleBundle} cheapestPrice={cheapestPrice} />
        <ResultCard result={individual} cheapestPrice={cheapestPrice} />
      </div>
    </div>
  );
}
