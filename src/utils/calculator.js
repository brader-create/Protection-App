import {
  GROUP_TYPES,
  GROUP_LABELS,
  WARRANTY_YEARS,
  PRICING,
  lookupPrice,
  getBracket,
  GROUP_APPLIANCE_COUNTS,
} from '../data/warrantyPricing';

/**
 * Calculate individual pricing - each appliance gets its own single warranty.
 * Small appliances try both SMALL and SINGLE pricing, using whichever is cheaper.
 */
export function calculateIndividual(appliances, years) {
  const items = [];
  let total = 0;
  let allValid = true;

  for (const app of appliances) {
    let groupType, price;

    if (app.isSmall) {
      const smallPrice = lookupPrice(GROUP_TYPES.SMALL, app.cost, years);
      const singlePrice = lookupPrice(GROUP_TYPES.SINGLE, app.cost, years);
      if (smallPrice !== null && (singlePrice === null || smallPrice <= singlePrice)) {
        groupType = GROUP_TYPES.SMALL;
        price = smallPrice;
      } else if (singlePrice !== null) {
        groupType = GROUP_TYPES.SINGLE;
        price = singlePrice;
      } else {
        groupType = GROUP_TYPES.SMALL;
        price = null;
      }
    } else {
      groupType = GROUP_TYPES.SINGLE;
      price = lookupPrice(groupType, app.cost, years);
    }

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

  return { items, total: allValid ? total : null, partialTotal: total, valid: allValid, label: 'Individual' };
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
 * Small appliances are included in the optimization — they're only priced
 * separately (using the Small Appliance bracket) when that's actually cheaper.
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

  // All appliances go into the optimization — small ones included
  const bestPartition = findBestPartition(appliances, years);

  if (!bestPartition) {
    return {
      items: [],
      total: null,
      valid: false,
      label: 'Best Mix',
    };
  }

  return {
    items: bestPartition.items,
    total: bestPartition.total,
    partialTotal: bestPartition.partialTotal || bestPartition.total,
    valid: bestPartition.valid !== false,
    label: 'Best Mix',
  };
}

/**
 * Find the optimal partition of appliances into warranty groups.
 * For up to 16 appliances, uses exhaustive search. Beyond that, uses greedy.
 */
function findBestPartition(appliances, years) {
  const n = appliances.length;

  if (n <= 16) {
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

      const groupAppliances = subset.map((i) => appliances[i]);
      const totalCost = groupAppliances.reduce((s, a) => s + a.cost, 0);

      // Determine group type(s) to try
      const typesToTry = [];
      if (groupSize === 1) {
        typesToTry.push(GROUP_TYPES.SINGLE);
        if (groupAppliances[0].isSmall) {
          typesToTry.push(GROUP_TYPES.SMALL);
        }
      } else if (groupSize === 2) {
        typesToTry.push(GROUP_TYPES.DOUBLE);
      } else {
        typesToTry.push(GROUP_TYPES.TRIPLE_PLUS);
      }

      // Remove these indices from the mask
      let newMask = mask;
      for (const i of subset) {
        newMask &= ~(1 << i);
      }

      for (const groupType of typesToTry) {
        const price = lookupPrice(groupType, totalCost, years);
        if (price === null) continue;

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
 * Generate non-empty subsets of an array of indices.
 * For performance, caps the maximum group size at 10 when there are many items,
 * since groups larger than ~10 rarely fall within pricing brackets.
 */
function getSubsets(indices) {
  const result = [];
  const n = indices.length;
  const maxGroupSize = n <= 12 ? n : Math.min(n, 10);

  // For small n, enumerate all subsets via bitmask
  if (n <= 16) {
    const total = 1 << n;
    for (let mask = 1; mask < total; mask++) {
      const subset = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) subset.push(indices[i]);
      }
      if (subset.length <= maxGroupSize) result.push(subset);
    }
    return result;
  }

  // For larger n, generate subsets up to maxGroupSize using combinations
  for (let size = 1; size <= maxGroupSize; size++) {
    generateCombinations(indices, size, 0, [], result);
  }
  return result;
}

function generateCombinations(indices, size, start, current, result) {
  if (current.length === size) {
    result.push([...current]);
    return;
  }
  for (let i = start; i < indices.length; i++) {
    current.push(indices[i]);
    generateCombinations(indices, size, i + 1, current, result);
    current.pop();
  }
}

/**
 * Greedy approach for larger sets.
 * Iteratively finds the most beneficial group from remaining items
 * until no more beneficial groupings exist, then prices the rest individually.
 */
function greedySearch(appliances, years) {
  const sorted = [...appliances].sort((a, b) => b.cost - a.cost);
  const used = new Set();
  const groups = [];
  let total = 0;

  // Pre-compute individual prices for each appliance
  function getIndividualPrice(app) {
    let best = lookupPrice(GROUP_TYPES.SINGLE, app.cost, years);
    if (app.isSmall) {
      const smallPrice = lookupPrice(GROUP_TYPES.SMALL, app.cost, years);
      if (smallPrice !== null && (best === null || smallPrice < best)) {
        best = smallPrice;
      }
    }
    return best;
  }

  // Iteratively find the best beneficial group from remaining items
  let foundGroup = true;
  while (foundGroup) {
    foundGroup = false;
    const remaining = [];
    for (let i = 0; i < sorted.length; i++) {
      if (!used.has(i)) remaining.push(i);
    }
    if (remaining.length < 2) break;

    let bestGroup = null;
    let bestSavings = 0;

    // Helper to evaluate a group candidate
    function evaluateGroup(candidates, groupType) {
      const groupAppliances = candidates.map((idx) => sorted[idx]);
      const groupCost = groupAppliances.reduce((s, a) => s + a.cost, 0);
      const price = lookupPrice(groupType, groupCost, years);
      if (price === null) return;

      let individualSum = 0;
      let allValid = true;
      for (const app of groupAppliances) {
        const p = getIndividualPrice(app);
        if (p === null) { allValid = false; break; }
        individualSum += p;
      }

      const savings = allValid ? individualSum - price : Infinity;
      if (savings > bestSavings) {
        bestSavings = savings;
        bestGroup = {
          indices: candidates,
          appliances: groupAppliances,
          groupType,
          totalCost: groupCost,
          price,
        };
      }
    }

    // Strategy A: Combinations from top items (not just consecutive)
    // For sizes 3-6, try all combos from top 12 remaining items
    const topN = Math.min(remaining.length, 12);
    const topItems = remaining.slice(0, topN);

    for (let size = Math.min(topN, 6); size >= 3; size--) {
      const combos = [];
      generateCombinations(topItems, size, 0, [], combos);
      for (const combo of combos) {
        evaluateGroup(combo, GROUP_TYPES.TRIPLE_PLUS);
      }
    }

    // Strategy B: Consecutive windows for larger groups (7-10) — fast scan
    for (let size = Math.min(remaining.length, 10); size >= 7; size--) {
      for (let start = 0; start <= remaining.length - size; start++) {
        evaluateGroup(remaining.slice(start, start + size), GROUP_TYPES.TRIPLE_PLUS);
      }
    }

    // Strategy C: Bracket-targeted groups
    // For each TRIPLE_PLUS bracket, greedily fill from remaining items
    const tpBrackets = PRICING[GROUP_TYPES.TRIPLE_PLUS];
    for (const bracket of tpBrackets) {
      const [bMin, bMax] = bracket;
      const picked = [];
      let sum = 0;
      for (const idx of remaining) {
        if (picked.length >= 10) break;
        if (sum + sorted[idx].cost <= bMax) {
          picked.push(idx);
          sum += sorted[idx].cost;
        }
      }
      if (picked.length >= 3 && sum >= bMin && sum <= bMax) {
        evaluateGroup(picked, GROUP_TYPES.TRIPLE_PLUS);
      }
    }

    // Try pairs from all remaining
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        evaluateGroup([remaining[i], remaining[j]], GROUP_TYPES.DOUBLE);
      }
    }

    if (bestGroup && bestSavings > 0) {
      for (const idx of bestGroup.indices) used.add(idx);
      total += bestGroup.price;
      groups.push({
        appliances: bestGroup.appliances,
        groupType: bestGroup.groupType,
        groupLabel: GROUP_LABELS[bestGroup.groupType],
        totalCost: bestGroup.totalCost,
        price: bestGroup.price,
        bracket: getBracket(bestGroup.groupType, bestGroup.totalCost),
      });
      foundGroup = true;
    }
  }

  // Remaining: individual pricing
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const app = sorted[i];
    let groupType = GROUP_TYPES.SINGLE;
    let price = lookupPrice(GROUP_TYPES.SINGLE, app.cost, years);

    if (app.isSmall) {
      const smallPrice = lookupPrice(GROUP_TYPES.SMALL, app.cost, years);
      if (smallPrice !== null && (price === null || smallPrice < price)) {
        groupType = GROUP_TYPES.SMALL;
        price = smallPrice;
      }
    }

    if (price !== null) {
      total += price;
      groups.push({
        appliances: [app],
        groupType,
        groupLabel: GROUP_LABELS[groupType],
        totalCost: app.cost,
        price,
        bracket: getBracket(groupType, app.cost),
      });
    } else {
      // Item exceeds max bracket — include with error but don't break
      groups.push({
        appliances: [app],
        groupType,
        groupLabel: GROUP_LABELS[groupType],
        totalCost: app.cost,
        price: null,
        error: `No bracket for $${app.cost.toLocaleString()} in ${GROUP_LABELS[groupType]}`,
      });
    }
    used.add(i);
  }

  const allPriced = groups.every(g => g.price !== null);
  return { items: groups, total: allPriced ? total : null, partialTotal: total, valid: allPriced };
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

/**
 * Analyze how close a group's cost is to a cheaper bracket boundary.
 * Returns info about potential savings if cost were reduced.
 */
export function analyzeBracketProximity(groupType, totalCost, years) {
  const brackets = PRICING[groupType];
  if (!brackets) return null;

  const yearIndex = WARRANTY_YEARS.indexOf(years);
  if (yearIndex === -1) return null;

  let currentIdx = -1;
  for (let i = 0; i < brackets.length; i++) {
    if (totalCost >= brackets[i][0] && totalCost <= brackets[i][1]) {
      currentIdx = i;
      break;
    }
  }

  if (currentIdx <= 0) return null; // already in lowest bracket or not found

  const currentPrice = brackets[currentIdx][2 + yearIndex];
  const lowerBracket = brackets[currentIdx - 1];
  const lowerPrice = lowerBracket[2 + yearIndex];

  if (lowerPrice >= currentPrice) return null; // no savings

  const reduceBy = totalCost - lowerBracket[1];
  if (reduceBy <= 0) return null;

  return {
    reduceBy,
    currentPrice,
    lowerPrice,
    saving: currentPrice - lowerPrice,
    targetMax: lowerBracket[1],
    bracketMax: brackets[currentIdx][1],
    bracketMin: brackets[currentIdx][0],
    positionInBracket: (totalCost - brackets[currentIdx][0]) / (brackets[currentIdx][1] - brackets[currentIdx][0]),
  };
}
