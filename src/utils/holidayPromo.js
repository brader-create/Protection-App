// The holiday (Black Friday / Christmas) promotion.
//
// Each model is marked by hand with how many additional years it gets free:
// 0 (doesn't qualify), 1, or rarely 2. For a chosen term:
//
//   - A model whose free years reach the term is covered at no charge.
//   - A qualifying model taken past its free years is paid for, and earns a
//     20% rebate instead of the free years. The rebate is 20% of what the
//     qualifying models being paid for would cost as one single bundle.
//   - Everything paid for is priced the cheapest way (the best bundle), and the
//     rebate comes off that as its own line.
//
// One additional year is sold on single appliances only, so at that term each
// paid model is priced on its own.

import { calculateAll, calculateIndividual, calculateSingleBundle } from './calculator';

export const PROMO_YEARS = [1, 2, 3, 4];
export const REBATE_RATE = 0.2;

// The symbol and wording for each level, on the toggles and in the results.
export const PROMO_BADGES = {
  1: { icon: '🎁', short: '+1 free', long: '1 free additional year', pdf: '+1 year free' },
  2: { icon: '🎅', short: '+2 free', long: '2 free additional years', pdf: '+2 years free' },
};

const STRATEGIES = ['bestMix', 'singleBundle', 'individual'];
const STRATEGY_LABELS = { bestMix: 'Best Mix', singleBundle: 'Single Bundle', individual: 'Individual' };

const roundCents = (n) => Math.round(n * 100) / 100;

// The cheapest valid option of a calculateAll result, preferring Best Mix on
// a tie, as { key, label, items, total }.
function cheapest(result) {
  let bestKey = null;
  for (const key of STRATEGIES) {
    const r = result?.[key];
    if (r?.valid && (bestKey === null || r.total < result[bestKey].total)) bestKey = key;
  }
  if (!bestKey) return null;
  const { items, total } = result[bestKey];
  return { key: bestKey, label: STRATEGY_LABELS[bestKey], items, total };
}

// What the qualifying models being paid for would cost as one single bundle.
// One model is priced on its own. Two cheap models can fall under the
// 2 Appliances table's lowest bracket; then they're priced the cheapest way.
function rebateBundle(appliances, years) {
  if (appliances.length === 1) {
    const single = calculateIndividual(appliances, years);
    if (!single.valid) return null;
    const item = single.items[0];
    return { groupLabel: item.groupLabel, totalCost: item.totalCost, price: single.total };
  }
  const bundle = calculateSingleBundle(appliances, years);
  if (bundle.valid) {
    const item = bundle.items[0];
    return { groupLabel: item.groupLabel, totalCost: item.totalCost, price: bundle.total };
  }
  const fallback = cheapest(calculateAll(appliances, years));
  if (!fallback) return null;
  return {
    groupLabel: fallback.label,
    totalCost: appliances.reduce((sum, a) => sum + a.cost, 0),
    price: fallback.total,
  };
}

/**
 * The promotion for one term.
 *
 * @param {Array} appliances - The models being priced (with any Save 3% applied).
 * @param {Object} promo - Free additional years by appliance id (1 or 2; missing = 0).
 * @param {number} years - Additional years, 1 to 4.
 * @param {Object} [fullResult] - calculateAll(appliances, years), when already
 *   worked out, to reuse when every model is being paid for.
 */
export function calculateHolidayTerm(appliances, promo, years, fullResult) {
  const free = [];
  const paid = [];
  const rebateAppliances = [];
  for (const app of appliances) {
    const freeYears = promo[app.id] || 0;
    if (freeYears >= years) {
      free.push(app);
    } else {
      paid.push(app);
      if (freeYears > 0) rebateAppliances.push(app);
    }
  }

  // What the free cover is worth: each model's own price for this term.
  const freeItems = free.map((app) => ({
    appliance: app,
    freeYears: promo[app.id],
    value: calculateIndividual([app], years).total,
  }));
  const freeValue = freeItems.reduce((sum, item) => sum + (item.value ?? 0), 0);

  let plan = null;
  if (paid.length > 0) {
    if (years === 1) {
      const individual = calculateIndividual(paid, 1);
      plan = individual.valid
        ? { key: 'individual', label: 'Individual', items: individual.items, total: individual.total }
        : null;
    } else {
      const result = paid.length === appliances.length && fullResult ? fullResult : calculateAll(paid, years);
      plan = cheapest(result);
    }
  }

  let rebate = null;
  if (rebateAppliances.length > 0) {
    const bundle = rebateBundle(rebateAppliances, years);
    rebate = {
      appliances: rebateAppliances,
      bundle,
      amount: bundle ? roundCents(bundle.price * REBATE_RATE) : null,
    };
  }

  const valid = (paid.length === 0 || plan !== null) && (!rebate || rebate.amount !== null);
  const subtotal = plan ? plan.total : 0;
  const total = valid ? roundCents(subtotal - (rebate?.amount ?? 0)) : null;

  return {
    years,
    free: freeItems,
    freeValue: roundCents(freeValue),
    paid,
    plan,
    rebate,
    subtotal,
    total,
    valid,
  };
}

/**
 * The promotion for every term, 1 to 4 additional years.
 * `fullByYear` holds calculateAll results for the regular terms, when already
 * worked out, to reuse.
 */
export function calculateHoliday(appliances, promo, fullByYear = {}) {
  const terms = {};
  for (const yr of PROMO_YEARS) {
    terms[yr] = calculateHolidayTerm(appliances, promo, yr, fullByYear[yr]);
  }
  return { terms, ...promoCounts(appliances, promo) };
}

// How many of the models get one and two free years.
export function promoCounts(appliances, promo) {
  let plusOne = 0;
  let plusTwo = 0;
  for (const app of appliances) {
    if (promo[app.id] === 1) plusOne++;
    else if (promo[app.id] === 2) plusTwo++;
  }
  return { plusOne, plusTwo, qualifying: plusOne + plusTwo };
}
