import {
  GROUP_TYPES,
  GROUP_LABELS,
  WARRANTY_YEARS,
  lookupPrice,
  getBracket,
  GROUP_APPLIANCE_COUNTS,
} from '../data/warrantyPricing';

/**
 * Calculate individual pricing - each appliance gets its own single warranty.
 */
export function calculateIndividual(appliances, years) {
  const items = [];
  let total = 0;
  let allValid = true;

  for (const app of appliances) {
    const groupType = app.isSmall ? GROUP_TYPES.SMALL : GROUP_TYPES.SINGLE;
    const price = lookupPrice(groupType, app.cost, years);
    if (price === null) {
      allValid = false;
      items.push({
        appliances: [app],
        groupType,
        groupLabel: GROUP_LABELS[groupType],
        totalCost: app.cost,
        price: null,
        error: `No bracket for $${app.cost.toLocaleString()} in ${GROUP_LABELS[groupType]}`,
      });
    } else {
      total += price;
      items.push({
        appliances: [app],
        groupType,
        groupLabel: GROUP_LABELS[groupType],
        totalCost: app.cost,
        price,
        bracket: getBracket(groupType, app.cost),
      });
    }
  }

  return { items, total: allValid ? total : null, valid: allValid, label: 'Individual' };
}

/**
 * Calculate single bundle pricing - all appliances in one group.
 * Uses the appropriate group based on count.
 */
export function calculateSingleBundle(appliances, years) {
  const count = appliances.length;
  const totalCost = appliances.reduce((sum, a) => sum + a.cost, 0);

  let groupType;
  if (count === 1) {
    groupType = appliances[0].isSmall ? GROUP_TYPES.SMALL : GROUP_TYPES.SINGLE;
  } else if (count === 2) {
    groupType = GROUP_TYPES.DOUBLE;
  } else {
    groupType = GROUP_TYPES.TRIPLE_PLUS;
  }

  const price = lookupPrice(groupType, totalCost, years);
  const bracket = getBracket(groupType, totalCost);

  const item = {
    appliances: [...appliances],
    groupType,
    groupLabel: GROUP_LABELS[groupType],
    totalCost,
    price,
    bracket,
    error: price === null ? `No bracket for $${totalCost.toLocaleString()} in ${GROUP_LABELS[groupType]}` : null,
  };

  return {
    items: [item],
    total: price,
    valid: price !== null,
    label: 'Single Bundle',
  };
}

/**
 * Find the best combination of warranty groups.
 * Uses dynamic programming / exhaustive partition search for small sets,
 * and greedy heuristics for larger sets.
 */
export function calculateBestMix(appliances, years) {
  if (appliances.length === 0) {
    return { items: [], total: 0, valid: true, label: 'Best Mix' };
  }

  if (appliances.length === 1) {
    return {
      ...calculateIndividual(appliances, years),
      label: 'Best Mix',
    };
  }

  // Separate small appliances from regular ones
  const smalls = appliances.filter((a) => a.isSmall);
  const regulars = appliances.filter((a) => !a.isSmall);

  // Price each small appliance individually (small appliance group is always 1 at a time)
  const smallItems = [];
  let smallTotal = 0;
  let smallsValid = true;

  for (const app of smalls) {
    const price = lookupPrice(GROUP_TYPES.SMALL, app.cost, years);
    if (price === null) {
      // Try single appliance group as fallback
      const singlePrice = lookupPrice(GROUP_TYPES.SINGLE, app.cost, years);
      if (singlePrice === null) {
        smallsValid = false;
        smallItems.push({
          appliances: [app],
          groupType: GROUP_TYPES.SMALL,
          groupLabel: GROUP_LABELS[GROUP_TYPES.SMALL],
          totalCost: app.cost,
          price: null,
          error: `No bracket for $${app.cost.toLocaleString()}`,
        });
      } else {
        smallTotal += singlePrice;
        smallItems.push({
          appliances: [app],
          groupType: GROUP_TYPES.SINGLE,
          groupLabel: GROUP_LABELS[GROUP_TYPES.SINGLE],
          totalCost: app.cost,
          price: singlePrice,
          bracket: getBracket(GROUP_TYPES.SINGLE, app.cost),
        });
      }
    } else {
      smallTotal += price;
      smallItems.push({
        appliances: [app],
        groupType: GROUP_TYPES.SMALL,
        groupLabel: GROUP_LABELS[GROUP_TYPES.SMALL],
        totalCost: app.cost,
        price,
        bracket: getBracket(GROUP_TYPES.SMALL, app.cost),
      });
    }
  }

  if (regulars.length === 0) {
    return {
      items: smallItems,
      total: smallsValid ? smallTotal : null,
      valid: smallsValid,
      label: 'Best Mix',
    };
  }

  // For regular appliances, find optimal partition into groups of 1, 2, or 3+
  const bestPartition = findBestPartition(regulars, years);

  if (!bestPartition || !smallsValid) {
    return {
      items: [...smallItems, ...(bestPartition ? bestPartition.items : [])],
      total: null,
      valid: false,
      label: 'Best Mix',
    };
  }

  return {
    items: [...smallItems, ...bestPartition.items],
    total: smallTotal + bestPartition.total,
    valid: true,
    label: 'Best Mix',
  };
}

/**
 * Find the optimal partition of regular appliances into warranty groups.
 * For up to ~12 appliances, uses exhaustive search. Beyond that, uses greedy.
 */
function findBestPartition(appliances, years) {
  const n = appliances.length;

  if (n <= 12) {
    return exhaustiveSearch(appliances, years);
  }
  return greedySearch(appliances, years);
}

/**
 * Exhaustive partition search using memoized recursion.
 * Tries all possible ways to form groups from the first k appliances.
 */
function exhaustiveSearch(appliances, years) {
  const n = appliances.length;
  // Use bitmask DP for small sets
  const memo = new Map();

  function solve(mask) {
    if (mask === 0) return { total: 0, groups: [] };
    if (memo.has(mask)) return memo.get(mask);

    const indices = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) indices.push(i);
    }

    let best = null;

    // Try all subsets of the remaining indices as a group
    const subsets = getSubsets(indices);

    for (const subset of subsets) {
      const groupSize = subset.length;
      if (groupSize === 0) continue;

      // Determine group type
      let groupType;
      if (groupSize === 1) {
        groupType = GROUP_TYPES.SINGLE;
      } else if (groupSize === 2) {
        groupType = GROUP_TYPES.DOUBLE;
      } else {
        groupType = GROUP_TYPES.TRIPLE_PLUS;
      }

      const groupAppliances = subset.map((i) => appliances[i]);
      const totalCost = groupAppliances.reduce((s, a) => s + a.cost, 0);
      const price = lookupPrice(groupType, totalCost, years);

      if (price === null) continue;

      // Remove these indices from the mask
      let newMask = mask;
      for (const i of subset) {
        newMask &= ~(1 << i);
      }

      const rest = solve(newMask);
      if (rest === null) continue;

      const totalPrice = price + rest.total;
      if (best === null || totalPrice < best.total) {
        best = {
          total: totalPrice,
          groups: [
            {
              appliances: groupAppliances,
              groupType,
              groupLabel: GROUP_LABELS[groupType],
              totalCost,
              price,
              bracket: getBracket(groupType, totalCost),
            },
            ...rest.groups,
          ],
        };
      }
    }

    memo.set(mask, best);
    return best;
  }

  const fullMask = (1 << n) - 1;
  const result = solve(fullMask);

  if (!result) return null;

  return {
    items: result.groups,
    total: result.total,
    valid: true,
  };
}

/**
 * Generate all non-empty subsets of an array of indices.
 * For performance, limits group size to reasonable bounds.
 */
function getSubsets(indices) {
  const result = [];
  const n = indices.length;

  // Generate subsets up to full size but cap at 20 for performance
  const limit = Math.min(n, 20);
  const total = 1 << limit;

  for (let mask = 1; mask < total; mask++) {
    const subset = [];
    for (let i = 0; i < limit; i++) {
      if (mask & (1 << i)) {
        subset.push(indices[i]);
      }
    }
    result.push(subset);
  }

  return result;
}

/**
 * Greedy approach for larger sets: sort by cost, try to form optimal groups.
 */
function greedySearch(appliances, years) {
  // Sort descending by cost to prioritize grouping expensive items
  const sorted = [...appliances].sort((a, b) => b.cost - a.cost);
  const used = new Set();
  const groups = [];
  let total = 0;

  // First pass: try to form 3+ groups (often best value for bundles)
  for (let size = sorted.length; size >= 3; size--) {
    for (let i = 0; i <= sorted.length - size; i++) {
      if (used.has(i)) continue;

      const candidates = [i];
      for (let j = i + 1; j < sorted.length && candidates.length < size; j++) {
        if (!used.has(j)) candidates.push(j);
      }

      if (candidates.length < size) continue;

      const groupAppliances = candidates.map((idx) => sorted[idx]);
      const totalCost = groupAppliances.reduce((s, a) => s + a.cost, 0);
      const price3plus = lookupPrice(GROUP_TYPES.TRIPLE_PLUS, totalCost, years);

      // Compare to breaking into smaller groups
      let individualSum = 0;
      let allValid = true;
      for (const app of groupAppliances) {
        const p = lookupPrice(GROUP_TYPES.SINGLE, app.cost, years);
        if (p === null) {
          allValid = false;
          break;
        }
        individualSum += p;
      }

      if (price3plus !== null && (!allValid || price3plus < individualSum)) {
        for (const idx of candidates) used.add(idx);
        total += price3plus;
        groups.push({
          appliances: groupAppliances,
          groupType: GROUP_TYPES.TRIPLE_PLUS,
          groupLabel: GROUP_LABELS[GROUP_TYPES.TRIPLE_PLUS],
          totalCost,
          price: price3plus,
          bracket: getBracket(GROUP_TYPES.TRIPLE_PLUS, totalCost),
        });
        break;
      }
    }
  }

  // Second pass: try pairs
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;

      const pair = [sorted[i], sorted[j]];
      const pairCost = pair[0].cost + pair[1].cost;
      const pairPrice = lookupPrice(GROUP_TYPES.DOUBLE, pairCost, years);

      const single1 = lookupPrice(GROUP_TYPES.SINGLE, pair[0].cost, years);
      const single2 = lookupPrice(GROUP_TYPES.SINGLE, pair[1].cost, years);

      if (pairPrice !== null && single1 !== null && single2 !== null) {
        if (pairPrice < single1 + single2) {
          used.add(i);
          used.add(j);
          total += pairPrice;
          groups.push({
            appliances: pair,
            groupType: GROUP_TYPES.DOUBLE,
            groupLabel: GROUP_LABELS[GROUP_TYPES.DOUBLE],
            totalCost: pairCost,
            price: pairPrice,
            bracket: getBracket(GROUP_TYPES.DOUBLE, pairCost),
          });
          break;
        }
      }
    }
  }

  // Remaining: individual
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const app = sorted[i];
    const price = lookupPrice(GROUP_TYPES.SINGLE, app.cost, years);
    if (price !== null) {
      total += price;
      groups.push({
        appliances: [app],
        groupType: GROUP_TYPES.SINGLE,
        groupLabel: GROUP_LABELS[GROUP_TYPES.SINGLE],
        totalCost: app.cost,
        price,
        bracket: getBracket(GROUP_TYPES.SINGLE, app.cost),
      });
    } else {
      return null;
    }
    used.add(i);
  }

  return { items: groups, total, valid: true };
}

/**
 * Run all three calculations and return comparison results.
 */
export function calculateAll(appliances, years) {
  if (appliances.length === 0) {
    return null;
  }

  const individual = calculateIndividual(appliances, years);
  const singleBundle = calculateSingleBundle(appliances, years);
  const bestMix = calculateBestMix(appliances, years);

  // Determine which is cheapest
  const validResults = [individual, singleBundle, bestMix].filter((r) => r.valid);
  let cheapest = null;
  for (const r of validResults) {
    if (cheapest === null || r.total < cheapest) {
      cheapest = r.total;
    }
  }

  return {
    individual: { ...individual, isCheapest: individual.valid && individual.total === cheapest },
    singleBundle: {
      ...singleBundle,
      isCheapest: singleBundle.valid && singleBundle.total === cheapest,
    },
    bestMix: { ...bestMix, isCheapest: bestMix.valid && bestMix.total === cheapest },
    cheapestPrice: cheapest,
    years,
  };
}
