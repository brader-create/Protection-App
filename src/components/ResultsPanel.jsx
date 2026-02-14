import { useState, useEffect, useMemo } from 'react';
import { WARRANTY_YEARS, lookupPrice, GROUP_TYPES, getBracket, PRICING } from '../data/warrantyPricing';
import { generateComparisonPDF } from '../utils/pdfExport';
import { analyzeBracketProximity, calculateAll, calculateIndividual } from '../utils/calculator';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ThresholdMeter({ item, years }) {
  const proximity = analyzeBracketProximity(item.groupType, item.totalCost, years);
  if (!proximity || proximity.reduceBy > 500) return null;

  const pct = Math.min(100, (proximity.reduceBy / 500) * 100);

  return (
    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-light)' }}>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-cyan-400">
          ${proximity.reduceBy.toLocaleString('en-US', { minimumFractionDigits: 2 })} from cheaper bracket
        </span>
        <span className="text-cyan-300 font-semibold">
          Save {formatPrice(proximity.saving)}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card-inner)' }}>
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
          style={{ width: `${100 - pct}%` }}
        />
      </div>
      <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
        Target: ${proximity.targetMax.toLocaleString()} combined → {formatPrice(proximity.lowerPrice)}
      </p>
    </div>
  );
}

/**
 * Turbo Charge: tries up to 6% discount on individual models to reach better brackets.
 * Uses minimum discount needed per model. Red alert if discount > 4% (risky margin).
 */
function computeTurboCharge(appliances, years, currentBestResult) {
  if (!currentBestResult?.valid || appliances.length < 2) return null;

  const currentBest = currentBestResult.total;
  let bestTurbo = null;

  // Try discount levels from 1% to 6% in 0.5% steps
  const discountSteps = [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06];

  for (const discount of discountSteps) {
    // Try applying discount to each subset of appliances
    // For efficiency, try each individual appliance first, then pairs
    for (let i = 0; i < appliances.length; i++) {
      const modified = appliances.map((a, idx) => {
        if (idx === i) {
          return { ...a, cost: Math.round(a.cost * (1 - discount) * 100) / 100 };
        }
        return a;
      });

      const result = calculateAll(modified, years);
      if (!result?.cheapestPrice || result.cheapestPrice >= currentBest) continue;

      const saving = currentBest - result.cheapestPrice;
      const discountAmount = appliances[i].cost - modified[i].cost;

      // Only worthwhile if warranty saving exceeds what we gave up in discount
      if (saving <= 0) continue;

      if (!bestTurbo || saving > bestTurbo.saving) {
        bestTurbo = {
          saving,
          discountPct: discount,
          discountAmount,
          modelIndex: i,
          model: appliances[i].model,
          originalCost: appliances[i].cost,
          newCost: modified[i].cost,
          newTotal: result.cheapestPrice,
          isRisky: discount > 0.04,
        };
      }
    }

    // Try pairs of appliances with same discount
    if (appliances.length >= 3) {
      for (let i = 0; i < appliances.length; i++) {
        for (let j = i + 1; j < appliances.length; j++) {
          const modified = appliances.map((a, idx) => {
            if (idx === i || idx === j) {
              return { ...a, cost: Math.round(a.cost * (1 - discount) * 100) / 100 };
            }
            return a;
          });

          const result = calculateAll(modified, years);
          if (!result?.cheapestPrice || result.cheapestPrice >= currentBest) continue;

          const saving = currentBest - result.cheapestPrice;
          if (!bestTurbo || saving > bestTurbo.saving) {
            const totalDiscount = (appliances[i].cost - modified[i].cost) + (appliances[j].cost - modified[j].cost);
            bestTurbo = {
              saving,
              discountPct: discount,
              discountAmount: totalDiscount,
              models: [
                { model: appliances[i].model, originalCost: appliances[i].cost, newCost: modified[i].cost },
                { model: appliances[j].model, originalCost: appliances[j].cost, newCost: modified[j].cost },
              ],
              newTotal: result.cheapestPrice,
              isRisky: discount > 0.04,
            };
          }
        }
      }
    }

    // If we found something at a lower discount, don't keep going higher
    if (bestTurbo && discount <= 0.03) break;
  }

  return bestTurbo;
}

function ResultCard({ result, cheapestPrice, originalResult, save3Active, years, showThresholds }) {
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

      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{result.label}</h3>

      {result.valid ? (
        <>
          <div className={`price-tag ${isBest ? 'text-emerald-400' : ''} mb-4`} style={!isBest ? { color: 'var(--text-primary)' } : {}}>
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
              <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-light)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="badge-blue text-[10px]">{item.groupLabel}</span>
                  <span className="text-sm font-semibold tabular-nums ml-auto" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(item.price)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {item.appliances.map((app, j) => (
                    <div key={j} className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <div className="truncate mr-2">
                        <span>{app.model}</span>
                        {app.description && (
                          <span className="ml-1.5" style={{ color: 'var(--text-faint)' }}>{app.description}</span>
                        )}
                      </div>
                      <span className="tabular-nums shrink-0">
                        ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
                {item.bracket && (
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
                    Bracket: ${item.bracket.min.toLocaleString()} – ${item.bracket.max.toLocaleString()}
                    {item.appliances.length > 1 && (
                      <span className="ml-1">(combined: ${item.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
                    )}
                  </p>
                )}
                {showThresholds && <ThresholdMeter item={item} years={years} />}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)' }}>
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

export default function ResultsPanel({ allResults, activeYear, onYearChange, appliances, save3Active, calculating, excludedIds, allAppliances }) {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const [showTurbo, setShowTurbo] = useState(false);

  // Progressive threshold reveal
  useEffect(() => {
    setShowThresholds(false);
    const timer = setTimeout(() => setShowThresholds(true), 600);
    return () => clearTimeout(timer);
  }, [allResults, activeYear]);

  if (!allResults) return null;

  const { byYear, originalByYear, productSavings } = allResults;
  const results = byYear[activeYear];
  if (!results) return null;

  const { bestMix, singleBundle, individual, cheapestPrice } = results;
  const originalResults = originalByYear ? originalByYear[activeYear] : null;

  const warrantySaved =
    save3Active && originalResults?.cheapestPrice !== null && cheapestPrice !== null
      ? originalResults.cheapestPrice - cheapestPrice
      : 0;
  const totalSaved = (productSavings || 0) + (warrantySaved > 0 ? warrantySaved : 0);

  // Percentage meter: warranty cost as % of total appliance cost
  const totalApplianceCost = appliances.reduce((s, a) => s + a.cost, 0);
  const warrantyPct = totalApplianceCost > 0 && cheapestPrice !== null
    ? ((cheapestPrice / totalApplianceCost) * 100).toFixed(1)
    : null;

  // Deselected models: compute individual warranty cost for each excluded item
  const deselectedInfo = useMemo(() => {
    if (!excludedIds || !allAppliances || excludedIds.size === 0) return [];
    return allAppliances
      .filter((a) => excludedIds.has(a.id))
      .map((a) => {
        const indivPrice = lookupPrice(
          a.isSmall ? GROUP_TYPES.SMALL : GROUP_TYPES.SINGLE,
          a.cost,
          activeYear
        );
        // If small, also check single and pick cheaper
        let bestIndiv = indivPrice;
        if (a.isSmall) {
          const singlePrice = lookupPrice(GROUP_TYPES.SINGLE, a.cost, activeYear);
          if (singlePrice !== null && (bestIndiv === null || singlePrice < bestIndiv)) {
            bestIndiv = singlePrice;
          }
        }
        return { ...a, individualWarranty: bestIndiv };
      });
  }, [excludedIds, allAppliances, activeYear]);

  // Turbo charge computation (lazy — only when clicked)
  const turboResult = useMemo(() => {
    if (!showTurbo) return null;
    return computeTurboCharge(appliances, activeYear, bestMix);
  }, [showTurbo, appliances, activeYear, bestMix]);

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

  function handleCopyEmail() {
    const lines = [];

    // Build year pricing data
    const yearData = [];
    for (const yr of WARRANTY_YEARS) {
      const yearResult = byYear[yr];
      if (!yearResult) continue;
      const best = yearResult.cheapestPrice;
      if (best === null) continue;
      const individualTotal = yearResult.individual?.valid ? yearResult.individual.total : null;
      const totalYears = yr + 1;
      yearData.push({ yr, totalYears, individualTotal, best });
    }

    if (yearData.length === 0) return;

    // Find the best value year
    const allBests = yearData.map((d) => d.best).filter(Boolean);
    // Best value = most coverage for money (highest year with competitive price)
    // Use the longest term as "best value" since it's cheapest per-year
    const bestValueYr = yearData[yearData.length - 1];

    lines.push('And one more quick thing I want to add because it\'s come up a lot lately. Manufacturer coverage is usually around 1 year, and that\'s essentially the minimum allowed in Canada. The main change in the last decade is that appliances are more "computerized" than ever. More sensors, boards, and moving pieces. So repair frequency can be higher, and the cost of parts/labour has definitely climbed.');
    lines.push('');
    lines.push('Below are the extended protection plan bundles through our partner here at Trail (from best value down). The crossed-out price is the regular individual total, and the bold price is the best bundled price I can do:');
    lines.push('');

    // Show from longest (best value) to shortest
    const sortedYearData = [...yearData].reverse();
    for (let i = 0; i < sortedYearData.length; i++) {
      const { yr, totalYears, individualTotal, best } = sortedYearData[i];
      const isBestValue = i === 0;

      let line = `${totalYears} years total (add ${yr} years): `;
      if (individualTotal !== null && individualTotal > best) {
        const saved = individualTotal - best;
        line += `$${individualTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} → $${best.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (isBestValue) {
          line += ` (save $${saved.toLocaleString('en-US', { minimumFractionDigits: 2 })} — best value)`;
        }
      } else {
        line += `$${best.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (isBestValue) line += ' (best value)';
      }

      lines.push(line);
    }

    lines.push('');
    lines.push('No pressure either way. I just want you to see it while we\'re already talking. If you have any questions at all about coverage, claims, or what\'s most worth protecting, just reply and I\'ll let you know.');

    const text = lines.join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Warranty Pricing Comparison</h2>
        <div className="flex items-center gap-2">
          {appliances && appliances.length > 0 && (
            <>
              <button
                onClick={handleCopyEmail}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Copy for Email
                  </>
                )}
              </button>
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
            </>
          )}
        </div>
      </div>

      {/* Year Tabs */}
      <div className="flex items-center gap-1 rounded-xl p-1 w-fit" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-main)' }}>
        {WARRANTY_YEARS.map((yr) => {
          const yearResult = byYear[yr];
          const isActive = yr === activeYear;
          const yearBest = yearResult?.cheapestPrice;
          const isLoading = !yearResult && calculating;
          return (
            <button
              key={yr}
              onClick={() => yearResult && onYearChange(yr)}
              disabled={!yearResult}
              className={`relative px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : yearResult
                    ? 'hover:opacity-80'
                    : 'opacity-40 cursor-not-allowed'
              }`}
              style={!isActive ? { color: 'var(--text-muted)' } : {}}
            >
              <span className="block">{yr}-Year</span>
              {isLoading ? (
                <div className="flex justify-center mt-1">
                  <div className="w-3 h-3 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                </div>
              ) : yearBest !== null && yearBest !== undefined ? (
                <span className={`block text-xs mt-0.5 tabular-nums ${isActive ? 'text-blue-200' : ''}`} style={!isActive ? { color: 'var(--text-faint)' } : {}}>
                  {formatPrice(yearBest)}
                </span>
              ) : null}
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

      {/* Best Price Banner + Percentage Meter */}
      {cheapestPrice !== null && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-emerald-300/70">Lowest Available Price ({activeYear}-Year)</p>
              <div className="flex items-baseline gap-3">
                <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatPrice(cheapestPrice)}</p>
                {warrantyPct !== null && (
                  <span className="text-sm font-semibold text-emerald-300/60 tabular-nums">{warrantyPct}% of appliance cost</span>
                )}
              </div>
              {warrantyPct !== null && (
                <div className="mt-2 w-full max-w-xs">
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-card-inner)' }}>
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(parseFloat(warrantyPct), 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deselected Models Info */}
      {deselectedInfo.length > 0 && (
        <div className="rounded-xl p-4 border border-slate-500/20" style={{ background: 'var(--bg-card-inner)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Deselected Models — Individual Warranty Cost</p>
          <div className="space-y-1">
            {deselectedInfo.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>{a.model}</span>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    Appliance: ${a.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="tabular-nums font-semibold text-blue-400">
                    Warranty: {a.individualWarranty !== null ? formatPrice(a.individualWarranty) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Turbo Charge Button + Result */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowTurbo(!showTurbo)}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            showTurbo
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
              : 'bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Turbo Charge
        </button>
        {showTurbo && !turboResult && (
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>No additional bracket savings found at up to 6%</span>
        )}
      </div>

      {showTurbo && turboResult && (
        <div className={`rounded-xl p-4 border ${turboResult.isRisky ? 'border-red-500/40 bg-red-500/5' : 'border-purple-500/30 bg-purple-500/10'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${turboResult.isRisky ? 'bg-red-500/20' : 'bg-purple-500/20'}`}>
              <svg className={`w-4 h-4 ${turboResult.isRisky ? 'text-red-400' : 'text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className={`text-sm font-bold ${turboResult.isRisky ? 'text-red-400' : 'text-purple-300'}`}>
                  Save {formatPrice(turboResult.saving)} with {(turboResult.discountPct * 100).toFixed(1)}% discount
                </p>
                {turboResult.isRisky && (
                  <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold">
                    RISKY MARGIN
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                New warranty total: <span className="font-semibold text-emerald-400">{formatPrice(turboResult.newTotal)}</span>
              </p>
              {turboResult.models ? (
                <div className="mt-1 space-y-0.5">
                  {turboResult.models.map((m, i) => (
                    <p key={i} className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      {m.model}: ${m.originalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} → ${m.newCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {turboResult.model}: ${turboResult.originalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} → ${turboResult.newCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              )}
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
          years={activeYear}
          showThresholds={showThresholds}
        />
        <ResultCard
          result={singleBundle}
          cheapestPrice={cheapestPrice}
          originalResult={originalResults?.singleBundle}
          save3Active={save3Active}
          years={activeYear}
          showThresholds={false}
        />
        <ResultCard
          result={individual}
          cheapestPrice={cheapestPrice}
          originalResult={originalResults?.individual}
          save3Active={save3Active}
          years={activeYear}
          showThresholds={false}
        />
      </div>
    </div>
  );
}
