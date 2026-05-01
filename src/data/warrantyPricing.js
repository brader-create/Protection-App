// Warranty List Options 6.01
// All pricing data structured by group type, cost bracket, and term length

export const WARRANTY_YEARS = [2, 3, 4];

export const GROUP_TYPES = {
  SMALL: 'small',
  SINGLE: 'single',
  DOUBLE: 'double',
  TRIPLE_PLUS: 'triplePlus',
};

export const GROUP_LABELS = {
  [GROUP_TYPES.SMALL]: 'Small Appliance',
  [GROUP_TYPES.SINGLE]: '1 Appliance',
  [GROUP_TYPES.DOUBLE]: '2 Appliances',
  [GROUP_TYPES.TRIPLE_PLUS]: '3+ Appliances',
};

export const GROUP_APPLIANCE_COUNTS = {
  [GROUP_TYPES.SMALL]: { min: 1, max: 1 },
  [GROUP_TYPES.SINGLE]: { min: 1, max: 1 },
  [GROUP_TYPES.DOUBLE]: { min: 2, max: 2 },
  [GROUP_TYPES.TRIPLE_PLUS]: { min: 3, max: Infinity },
};

// Each entry: [minCost, maxCost, price2yr, price3yr, price4yr]
export const PRICING = {
  [GROUP_TYPES.SMALL]: [
    [0, 499.99, 99.98, 99.98, 149.98],
    [500, 1000, 119.98, 129.98, 179.98],
  ],

  [GROUP_TYPES.SINGLE]: [
    [0, 499.99, 119.98, 169.98, 219.98],
    [500, 749.99, 149.98, 219.98, 259.98],
    [750, 999.99, 169.98, 249.98, 299.98],
    [1000, 1249.99, 199.98, 299.98, 369.98],
    [1250, 1499.99, 209.98, 309.98, 389.98],
    [1500, 1999.99, 249.98, 349.98, 469.98],
    [2000, 2499.99, 259.98, 389.98, 499.98],
    [2500, 3499.99, 299.98, 449.98, 599.98],
    [3500, 4999.99, 299.98, 489.98, 599.98],
    [5000, 7499.99, 449.98, 629.98, 849.98],
    [7500, 9999.99, 629.98, 949.98, 1199.98],
    [10000, 12499.99, 749.98, 1099.98, 1399.98],
    [12500, 17499.99, 999.98, 1449.98, 1899.98],
    [17500, 25000, 1349.98, 2079.98, 2699.98],
  ],

  [GROUP_TYPES.DOUBLE]: [
    [400, 999.99, 189.98, 289.98, 349.98],
    [1000, 1249.99, 239.98, 349.98, 449.98],
    [1250, 1499.99, 259.98, 379.98, 489.98],
    [1500, 1749.99, 289.98, 399.98, 529.98],
    [1750, 2499.99, 289.98, 399.98, 549.98],
    [2500, 3499.99, 389.98, 529.98, 699.98],
    [3500, 4999.99, 449.98, 629.98, 799.98],
    [5000, 7499.99, 529.98, 769.98, 999.98],
    [7500, 9999.99, 749.98, 1099.98, 1449.98],
    [10000, 19999.99, 1199.98, 1849.98, 2399.98],
    [20000, 34999.99, 1999.98, 2999.98, 3999.98],
    [35000, 50000, 2899.98, 4349.98, 5799.98],
  ],

  [GROUP_TYPES.TRIPLE_PLUS]: [
    [900, 1499.99, 299.98, 469.98, 599.98],
    [1500, 1999.99, 369.98, 529.98, 699.98],
    [2000, 2499.99, 389.98, 549.98, 699.98],
    [2500, 3499.99, 449.98, 639.98, 849.98],
    [3500, 4999.99, 499.98, 699.98, 949.98],
    [5000, 7499.99, 749.98, 999.98, 1399.98],
    [7500, 9999.99, 789.98, 1099.98, 1499.98],
    [10000, 12499.99, 1199.98, 1699.98, 2199.98],
    [12500, 14999.99, 1269.98, 1899.98, 2499.98],
    [15000, 19999.99, 1649.98, 2499.98, 3299.98],
    [20000, 24999.99, 2269.98, 3339.98, 4399.98],
    [25000, 29999.99, 2849.98, 4199.98, 5599.98],
    [30000, 34999.99, 3399.98, 4999.98, 6699.98],
    [35000, 39999.99, 3899.98, 5899.98, 7899.98],
    [40000, 44999.99, 4499.98, 6679.98, 8999.98],
    [45000, 49999.99, 5099.98, 7569.98, 9999.98],
    [50000, 74999.99, 5699.98, 8449.98, 10999.98],
    [75000, 99999.99, 8899.98, 13299.98, 17999.98],
    [100000, 124999.99, 11999.98, 17799.98, 23999.98],
    [125000, 150000.99, 14999.98, 22249.98, 29999.98],
  ],
};

/**
 * Look up warranty price for a group type, total cost of appliances, and year term.
 * @param {string} groupType - One of GROUP_TYPES values
 * @param {number} totalCost - Combined cost of all appliances in the group
 * @param {number} years - 2, 3, or 4
 * @returns {number|null} - Price or null if no bracket matches
 */
export function lookupPrice(groupType, totalCost, years) {
  const brackets = PRICING[groupType];
  if (!brackets) return null;

  const yearIndex = WARRANTY_YEARS.indexOf(years);
  if (yearIndex === -1) return null;

  for (const bracket of brackets) {
    const [min, max] = bracket;
    if (totalCost >= min && totalCost <= max) {
      return bracket[2 + yearIndex];
    }
  }
  return null;
}

/**
 * Get the price bracket range for a group type and cost.
 * @returns {{ min: number, max: number } | null}
 */
export function getBracket(groupType, totalCost) {
  const brackets = PRICING[groupType];
  if (!brackets) return null;

  for (const bracket of brackets) {
    if (totalCost >= bracket[0] && totalCost <= bracket[1]) {
      return { min: bracket[0], max: bracket[1] };
    }
  }
  return null;
}
