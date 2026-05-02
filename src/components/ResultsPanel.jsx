import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
 * Turbo Charge: tries minimal discounts on models to reach better brackets.
 * For ≤10 models: brute-force all singles + pairs (fast enough).
 * For >10 models: smart bracket targeting — analyze current groups,
 *   find near-boundary opportunities, verify only top candidates.
 */
function computeTurboCharge(appliances, years, currentBestResult) {
  if (!currentBestResult?.valid || appliances.length < 2) return null;

  const currentBest = currentBestResult.total;

  if (appliances.length <= 10) {
    return bruteForceTurbo(appliances, years, currentBest);
  }
  return smartTurbo(appliances, years, currentBestResult, currentBest);
}

/** Brute-force turbo for small bundles (≤10 models) */
function bruteForceTurbo(appliances, years, currentBest) {
  let bestTurbo = null;
  const discountSteps = [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06];

  for (const discount of discountSteps) {
    for (let i = 0; i < appliances.length; i++) {
      const modified = appliances.map((a, idx) =>
        idx === i ? { ...a, cost: Math.round(a.cost * (1 - discount) * 100) / 100 } : a
      );
      const result = calculateAll(modified, years);
      if (!result?.cheapestPrice || result.cheapestPrice >= currentBest) continue;
      const saving = currentBest - result.cheapestPrice;
      if (saving <= 0) continue;
      if (!bestTurbo || saving > bestTurbo.saving) {
        bestTurbo = buildTurboResult(appliances, modified, discount, { [i]: discount }, result, saving);
      }
    }

    if (appliances.length >= 3) {
      for (let i = 0; i < appliances.length; i++) {
        for (let j = i + 1; j < appliances.length; j++) {
          const modified = appliances.map((a, idx) =>
            idx === i || idx === j ? { ...a, cost: Math.round(a.cost * (1 - discount) * 100) / 100 } : a
          );
          const result = calculateAll(modified, years);
          if (!result?.cheapestPrice || result.cheapestPrice >= currentBest) continue;
          const saving = currentBest - result.cheapestPrice;
          if (!bestTurbo || saving > bestTurbo.saving) {
            bestTurbo = buildTurboResult(appliances, modified, discount, { [i]: discount, [j]: discount }, result, saving);
          }
        }
      }
    }

    if (bestTurbo && discount <= 0.03) break;
  }
  return bestTurbo;
}

/** Smart turbo for larger bundles (>10 models): bracket proximity targeting */
function smartTurbo(appliances, years, currentBestResult, currentBest) {
  const candidates = [];

  // Analyze each group's bracket proximity
  for (const item of currentBestResult.items) {
    const proximity = analyzeBracketProximity(item.groupType, item.totalCost, years);
    if (!proximity || proximity.saving <= 0) continue;

    const reduceBy = proximity.reduceBy;
    const warrantySaving = proximity.saving;

    // Find which model(s) could be discounted to reach the lower bracket
    for (const app of item.appliances) {
      const discountNeeded = reduceBy / app.cost;
      const pct = Math.ceil(discountNeeded * 200) / 200; // Round up to 0.5%
      if (pct > 0 && pct <= 0.06) {
        const idx = appliances.findIndex(a => a.id === app.id);
        if (idx >= 0) {
          candidates.push({ indices: [idx], pcts: [pct], warrantySaving });
        }
      }
    }

    // Try pairs within the group
    if (item.appliances.length >= 2) {
      for (let i = 0; i < item.appliances.length; i++) {
        for (let j = i + 1; j < item.appliances.length; j++) {
          const combined = item.appliances[i].cost + item.appliances[j].cost;
          const discountNeeded = reduceBy / combined;
          const pct = Math.ceil(discountNeeded * 200) / 200;
          if (pct > 0 && pct <= 0.06) {
            const idx1 = appliances.findIndex(a => a.id === item.appliances[i].id);
            const idx2 = appliances.findIndex(a => a.id === item.appliances[j].id);
            if (idx1 >= 0 && idx2 >= 0) {
              candidates.push({ indices: [idx1, idx2], pcts: [pct, pct], warrantySaving });
            }
          }
        }
      }
    }
  }

  // Also try discounting high-cost models individually across all discount steps
  // (catches cross-group optimizations the proximity analysis might miss)
  const topModels = appliances
    .map((a, i) => ({ i, cost: a.cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 6);

  for (const { i } of topModels) {
    for (const pct of [0.02, 0.04, 0.06]) {
      candidates.push({ indices: [i], pcts: [pct], warrantySaving: 0 });
    }
  }

  // Sort by expected warranty saving, dedupe
  candidates.sort((a, b) => b.warrantySaving - a.warrantySaving);
  const tried = new Set();
  let bestTurbo = null;

  for (const c of candidates) {
    const key = c.indices.join(',') + ':' + c.pcts.join(',');
    if (tried.has(key)) continue;
    tried.add(key);
    if (tried.size > 15) break; // Limit total calculateAll calls

    const discountMap = {};
    const modified = appliances.map((a, idx) => {
      const ci = c.indices.indexOf(idx);
      if (ci >= 0) {
        discountMap[idx] = c.pcts[ci];
        return { ...a, cost: Math.round(a.cost * (1 - c.pcts[ci]) * 100) / 100 };
      }
      return a;
    });

    const result = calculateAll(modified, years);
    if (!result?.cheapestPrice || result.cheapestPrice >= currentBest) continue;

    const saving = currentBest - result.cheapestPrice;
    if (!bestTurbo || saving > bestTurbo.saving) {
      bestTurbo = buildTurboResult(appliances, modified, Math.max(...c.pcts), discountMap, result, saving);
    }
  }

  return bestTurbo;
}

/** Compute "next deal" suggestions from bracket proximity analysis */
function computeNextDeals(appliances, years, bestMixResult) {
  if (!bestMixResult?.valid) return [];
  const deals = [];

  for (const item of bestMixResult.items) {
    const proximity = analyzeBracketProximity(item.groupType, item.totalCost, years);
    if (!proximity || proximity.saving <= 0) continue;

    const reduceBy = proximity.reduceBy;

    // Find cheapest single-model discount to achieve the reduction
    let bestDeal = null;
    for (const app of item.appliances) {
      const pctNeeded = reduceBy / app.cost;
      const pctRounded = Math.ceil(pctNeeded * 200) / 200;
      if (pctRounded <= 0 || pctRounded > 0.10) continue; // Show up to 10% for suggestions
      const discountAmount = Math.round(app.cost * pctRounded * 100) / 100;
      if (!bestDeal || pctRounded < bestDeal.pctNeeded) {
        bestDeal = {
          model: app.model,
          pctNeeded: pctRounded,
          discountAmount,
          warrantySaving: proximity.saving,
          netSaving: proximity.saving,
          targetMax: proximity.targetMax,
          isAchievable: pctRounded <= 0.06,
          groupLabel: item.groupLabel,
        };
      }
    }
    if (bestDeal) deals.push(bestDeal);
  }

  return deals.sort((a, b) => b.netSaving - a.netSaving).slice(0, 5);
}

function buildTurboResult(original, modified, maxDiscount, discountMap, calcResult, saving) {
  // Build per-model detail
  const modelDetails = [];
  let totalDiscountAmount = 0;
  for (const [idx, pct] of Object.entries(discountMap)) {
    const i = parseInt(idx);
    const orig = original[i];
    const mod = modified[i];
    const diff = orig.cost - mod.cost;
    totalDiscountAmount += diff;
    modelDetails.push({
      model: orig.model,
      originalCost: orig.cost,
      newCost: mod.cost,
      discountPct: pct,
      discountAmount: diff,
    });
  }

  // Find which strategy won — prefer bestMix
  const bestResult = calcResult.bestMix?.valid ? calcResult.bestMix : null;

  return {
    saving,
    maxDiscountPct: maxDiscount,
    totalDiscountAmount,
    modelDetails,
    newTotal: calcResult.cheapestPrice,
    isRisky: maxDiscount > 0.04,
    // Include the full bestMix result so we can render its items
    turboItems: bestResult?.items || [],
    originalTotal: original.reduce((s, a) => s + a.cost, 0),
    modifiedTotal: modified.reduce((s, a) => s + a.cost, 0),
    // Map of model name → discount info for rendering inline
    discountByModel: Object.fromEntries(
      Object.entries(discountMap).map(([idx, pct]) => {
        const i = parseInt(idx);
        return [original[i].model, { pct, originalCost: original[i].cost, newCost: modified[i].cost }];
      })
    ),
  };
}

function ResultCard({ result, cheapestPrice, originalResult, save3Active, years, showThresholds }) {
  const isBest = result.isCheapest && result.valid;
  const hasValidItems = result.items && result.items.some(i => i.price !== null);
  const hasErrors = result.items && result.items.some(i => i.error);
  const showItems = result.valid || hasValidItems;
  const displayTotal = result.valid ? result.total : result.partialTotal || null;

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

      {showItems ? (
        <>
          <div className={`price-tag ${isBest ? 'text-emerald-400' : ''} mb-4`} style={!isBest ? { color: 'var(--text-primary)' } : {}}>
            {formatPrice(displayTotal)}
            {!result.valid && hasErrors && (
              <span className="text-xs text-red-400 font-normal ml-2">(partial — see alerts below)</span>
            )}
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
            {result.items.map((item, i) => {
              const isError = item.price === null;
              return (
                <div key={i} className={`rounded-lg p-3 ${isError ? 'border-red-500/40' : ''}`}
                  style={{
                    background: isError ? 'rgba(239,68,68,0.05)' : 'var(--bg-card-inner)',
                    border: isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border-light)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={isError ? 'text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/20' : 'badge-blue text-[10px]'}>
                      {isError ? 'No Bracket' : item.groupLabel}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ml-auto ${isError ? 'text-red-400' : ''}`} style={!isError ? { color: 'var(--text-primary)' } : {}}>
                      {isError ? 'N/A' : formatPrice(item.price)}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {item.appliances.map((app, j) => (
                      <div key={j} className={`flex items-center justify-between text-xs ${isError ? 'text-red-400/80' : ''}`} style={!isError ? { color: 'var(--text-muted)' } : {}}>
                        <div className="truncate mr-2">
                          <span>{app.model}</span>
                          {app.description && (
                            <span className="ml-1.5" style={{ color: isError ? 'rgba(239,68,68,0.5)' : 'var(--text-faint)' }}>{app.description}</span>
                          )}
                        </div>
                        <span className="tabular-nums shrink-0">
                          ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {isError && (
                    <p className="text-[10px] mt-1.5 text-red-400/60">
                      {item.error} — exceeds maximum bracket
                    </p>
                  )}
                  {!isError && item.bracket && (
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
                      Bracket: ${item.bracket.min.toLocaleString()} – ${item.bracket.max.toLocaleString()}
                      {item.appliances.length > 1 && (
                        <span className="ml-1">(combined: ${item.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
                      )}
                    </p>
                  )}
                  {!isError && showThresholds && <ThresholdMeter item={item} years={years} />}
                </div>
              );
            })}
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

/** Best Mix card with integrated Turbo Charge */
function BestMixCard({ result, cheapestPrice, originalResult, save3Active, years, showThresholds, appliances, onTurboResult }) {
  const [turboActive, setTurboActive] = useState(false);
  const [turboLoading, setTurboLoading] = useState(false);
  const [turboResult, setTurboResult] = useState(null);
  const [nextDeals, setNextDeals] = useState([]);
  const turboIdRef = useRef(0);

  const isBest = result.isCheapest && result.valid;
  const warrantySaved =
    save3Active && originalResult?.valid && result.valid
      ? originalResult.total - result.total
      : null;

  // Reset turbo when year/results change
  useEffect(() => {
    setTurboActive(false);
    setTurboResult(null);
    setTurboLoading(false);
    setNextDeals([]);
    ++turboIdRef.current;
    if (onTurboResult) onTurboResult(null);
  }, [years, result]);

  const handleTurboToggle = useCallback(() => {
    if (turboActive) {
      setTurboActive(false);
      setTurboResult(null);
      setNextDeals([]);
      ++turboIdRef.current;
      if (onTurboResult) onTurboResult(null);
      return;
    }

    setTurboActive(true);
    setTurboLoading(true);
    const id = ++turboIdRef.current;

    // Run async so UI stays responsive
    setTimeout(() => {
      const res = computeTurboCharge(appliances, years, result);
      const deals = computeNextDeals(appliances, years, result);
      if (turboIdRef.current !== id) return;
      setTurboResult(res);
      setNextDeals(deals);
      setTurboLoading(false);
      if (onTurboResult) onTurboResult(res);
    }, 50);
  }, [turboActive, appliances, years, result, onTurboResult]);

  const showingTurbo = turboActive && turboResult && !turboLoading;
  const displayTotal = showingTurbo ? turboResult.newTotal : result.total;
  const displayIsBest = showingTurbo ? true : isBest;

  return (
    <div className={`result-card relative overflow-hidden ${displayIsBest ? 'result-card-best border-emerald-500/40' : ''} ${turboActive ? 'turbo-active' : ''}`}>
      {/* Turbo active subtle bolt in background */}
      {turboActive && !turboLoading && (
        <div className="absolute top-2 left-2 turbo-bolt pointer-events-none">
          <svg className="w-6 h-6 text-purple-500/15" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      )}

      {/* Badge area */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {displayIsBest && !turboActive && (
          <span className="badge-emerald flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Best Price
          </span>
        )}
        {showingTurbo && (
          <span className={`badge-purple flex items-center gap-1.5 ${turboResult.isRisky ? '!bg-red-500/20 !text-red-400 !border-red-500/30' : ''}`}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {turboResult.isRisky ? 'Risky Margin' : 'Turbo Active'}
          </span>
        )}
      </div>

      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{result.label}</h3>

      {(result.valid || (result.items && result.items.some(i => i.price !== null))) ? (
        <>
          {/* Price display — cross off original when turbo is showing */}
          <div className="mb-4">
            {showingTurbo ? (
              <div className="flex items-baseline gap-3">
                <span className="price-tag text-purple-400">{formatPrice(turboResult.newTotal)}</span>
                <span className="text-lg line-through tabular-nums" style={{ color: 'var(--text-faint)' }}>{formatPrice(result.total)}</span>
              </div>
            ) : (
              <div className={`price-tag ${isBest ? 'text-emerald-400' : ''}`} style={!isBest ? { color: 'var(--text-primary)' } : {}}>
                {formatPrice(result.total || result.partialTotal)}
                {!result.valid && result.items.some(i => i.error) && (
                  <span className="text-xs text-red-400 font-normal ml-2">(partial)</span>
                )}
              </div>
            )}
          </div>

          {/* Turbo savings summary */}
          {showingTurbo && (
            <div className={`rounded-lg p-3 mb-4 border ${turboResult.isRisky ? 'bg-red-500/5 border-red-500/20' : 'bg-purple-500/5 border-purple-500/20'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold ${turboResult.isRisky ? 'text-red-400' : 'text-purple-300'}`}>
                  Turbo Savings: {formatPrice(turboResult.saving)}
                </span>
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Appliance discount: {formatPrice(turboResult.totalDiscountAmount)}
                </span>
              </div>
              <div className="space-y-1">
                {turboResult.modelDetails.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span style={{ color: 'var(--text-muted)' }}>{m.model}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${turboResult.isRisky ? 'bg-red-500/15 text-red-400' : 'bg-purple-500/15 text-purple-300'}`}>
                        -{(m.discountPct * 100).toFixed(1)}%
                      </span>
                      <span className="line-through tabular-nums" style={{ color: 'var(--text-faint)' }}>
                        ${m.originalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="tabular-nums font-semibold text-purple-300">
                        ${m.newCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {warrantySaved !== null && warrantySaved > 0 && !showingTurbo && (
            <p className="text-sm text-amber-400 mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Save {formatPrice(warrantySaved)} on warranty with 3%
            </p>
          )}

          {/* Group breakdown — show turbo items if active, original items otherwise */}
          <div className="space-y-3">
            {(showingTurbo ? turboResult.turboItems : result.items).map((item, i) => {
              const isError = item.price === null;
              return (
                <div key={i} className={`rounded-lg p-3 ${isError ? 'border-red-500/40' : ''}`}
                  style={{
                    background: isError ? 'rgba(239,68,68,0.05)' : 'var(--bg-card-inner)',
                    border: isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border-light)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={isError ? 'text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/20' : 'badge-blue text-[10px]'}>
                      {isError ? 'No Bracket' : item.groupLabel}
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      {/* Show original group price crossed off if turbo changed it */}
                      {!isError && showingTurbo && result.items[i] && result.items[i].price !== item.price && (
                        <span className="text-xs line-through tabular-nums" style={{ color: 'var(--text-faint)' }}>
                          {formatPrice(result.items[i].price)}
                        </span>
                      )}
                      <span className={`text-sm font-semibold tabular-nums ${isError ? 'text-red-400' : showingTurbo ? 'text-purple-300' : ''}`} style={!isError && !showingTurbo ? { color: 'var(--text-primary)' } : {}}>
                        {isError ? 'N/A' : formatPrice(item.price)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {item.appliances.map((app, j) => {
                      const turboDiscount = showingTurbo && !isError ? turboResult.discountByModel[app.model] : null;
                      return (
                        <div key={j} className={`flex items-center justify-between text-xs ${isError ? 'text-red-400/80' : ''}`} style={!isError ? { color: 'var(--text-muted)' } : {}}>
                          <div className="truncate mr-2 flex items-center gap-1.5">
                            <span>{app.model}</span>
                            {app.description && (
                              <span style={{ color: isError ? 'rgba(239,68,68,0.5)' : 'var(--text-faint)' }}>{app.description}</span>
                            )}
                            {turboDiscount && (
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${turboResult.isRisky ? 'bg-red-500/15 text-red-400' : 'bg-purple-500/15 text-purple-300'}`}>
                                -{(turboDiscount.pct * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {turboDiscount && (
                              <span className="line-through tabular-nums" style={{ color: 'var(--text-faint)' }}>
                                ${turboDiscount.originalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            <span className={`tabular-nums ${turboDiscount ? 'font-semibold text-purple-300' : ''}`}>
                              ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isError && (
                    <p className="text-[10px] mt-1.5 text-red-400/60">
                      {item.error} — exceeds maximum bracket
                    </p>
                  )}
                  {!isError && item.bracket && (
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
                      Bracket: ${item.bracket.min.toLocaleString()} – ${item.bracket.max.toLocaleString()}
                      {item.appliances.length > 1 && (
                        <span className="ml-1">(combined: ${item.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
                      )}
                    </p>
                  )}
                  {!isError && showThresholds && !showingTurbo && <ThresholdMeter item={item} years={years} />}
                </div>
              );
            })}
          </div>

          {/* Turbo Charge button — inside the card */}
          <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
            <button
              onClick={handleTurboToggle}
              disabled={turboLoading}
              className={`w-full text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                turboActive
                  ? turboResult?.isRisky
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/25'
                    : 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                  : 'bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25'
              }`}
            >
              {turboLoading ? (
                <>
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
                    <svg className="absolute inset-0.5 w-4 h-4 text-purple-300 turbo-bolt" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  Analyzing brackets...
                </>
              ) : (
                <>
                  <svg className={`w-4 h-4 ${turboActive ? 'turbo-bolt' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {turboActive
                    ? turboResult
                      ? 'Disable Turbo'
                      : 'No bracket savings found'
                    : 'Turbo Charge'}
                </>
              )}
            </button>

            {/* Turbo loading scan bar */}
            {turboLoading && (
              <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-card-inner)' }}>
                <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-purple-500 to-transparent rounded-full turbo-scan-bar" />
              </div>
            )}

            {/* Next Deal Suggestions */}
            {turboActive && !turboLoading && nextDeals.length > 0 && (
              <div className="mt-3 rounded-lg p-3 border border-purple-500/15" style={{ background: 'var(--bg-card-inner)' }}>
                <p className="text-[11px] font-bold text-purple-300 mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Next Deals
                </p>
                <div className="space-y-1.5">
                  {nextDeals.map((deal, i) => (
                    <div key={i} className="text-[10px] flex items-center justify-between gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span className="font-semibold">{deal.model}</span>
                        <span className="mx-1">→</span>
                        <span className={deal.isAchievable ? 'text-purple-300' : 'text-amber-400'}>
                          -{(deal.pctNeeded * 100).toFixed(1)}% ({formatPrice(deal.discountAmount)})
                        </span>
                      </span>
                      <span className="font-bold text-emerald-400 shrink-0">
                        Save {formatPrice(deal.warrantySaving)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
  const [turboSavings, setTurboSavings] = useState(null);

  // Reset turbo savings when results change
  useEffect(() => {
    setTurboSavings(null);
  }, [allResults, activeYear]);

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

    const sortedYears = [...WARRANTY_YEARS].reverse();
    for (const yr of sortedYears) {
      const yearResult = byYear[yr];
      if (!yearResult) continue;
      const best = yearResult.cheapestPrice;
      if (best === null) continue;
      const individualTotal = yearResult.individual?.valid ? yearResult.individual.total : null;
      const totalYears = yr + 1;

      let line = `${totalYears} years (add ${yr}): `;
      if (individualTotal !== null) {
        line += `Individual $${individualTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (best < individualTotal) {
          line += ` | Best Bundle $${best.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }
      } else {
        line += `Best Bundle $${best.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
      lines.push(line);
    }

    if (lines.length === 0) return;
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

      {/* Turbo Savings Banner */}
      {turboSavings && (
        <div className="bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-purple-300/70">Turbo Charge Warranty Savings</p>
              <p className={`text-2xl font-bold tabular-nums ${turboSavings.isRisky ? 'text-red-400' : 'text-purple-400'}`}>
                {formatPrice(turboSavings.saving)}
              </p>
              <div className="flex gap-4 mt-1 text-xs text-purple-300/50">
                <span>Appliance discount: {formatPrice(turboSavings.totalDiscountAmount)}</span>
                {save3Active && totalSaved > 0 && (
                  <span>Additional above 3%: {formatPrice(turboSavings.saving)}</span>
                )}
                <span>Max: -{(turboSavings.maxDiscountPct * 100).toFixed(1)}%</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BestMixCard
          result={bestMix}
          cheapestPrice={cheapestPrice}
          originalResult={originalResults?.bestMix}
          save3Active={save3Active}
          years={activeYear}
          showThresholds={showThresholds}
          appliances={appliances}
          onTurboResult={setTurboSavings}
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
