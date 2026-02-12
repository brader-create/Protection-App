// Warranty List Options 6.0
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
    [0, 499.99, 89.98, 99.98, 139.98],
    [500, 1000, 109.98, 119.98, 169.98],
  ],

  [GROUP_TYPES.SINGLE]: [
    [0, 499.99, 109.98, 159.98, 209.98],
    [500, 749.99, 139.98, 209.98, 249.98],
    [750, 999.99, 159.98, 239.98, 289.98],
    [1000, 1249.99, 189.98, 279.98, 349.98],
    [1250, 1499.99, 199.98, 289.98, 369.98],
    [1500, 1999.99, 239.98, 339.98, 459.98],
    [2000, 2499.98, 249.98, 369.98, 479.98],
    [2500, 3499.99, 289.98, 419.98, 579.98],
    [3500, 4999.99, 289.98, 459.98, 579.98],
    [5000, 7499.99, 419.98, 599.98, 799.98],
    [7500, 9999.99, 599.98, 899.98, 1159.98],
    [10000, 12499.99, 629.98, 929.98, 1229.98],
    [12500, 17499.99, 949.98, 1379.98, 1799.98],
    [17500, 25000, 1259.98, 1959.98, 2599.98],
  ],

  [GROUP_TYPES.DOUBLE]: [
    [400, 999.99, 179.98, 269.98, 339.98],
    [1000, 1249.99, 229.98, 329.98, 419.98],
    [1250, 1499.99, 249.98, 359.98, 459.98],
    [1500, 1749.99, 269.98, 389.98, 499.98],
    [1750, 2499.99, 269.98, 389.98, 529.98],
    [2500, 3499.99, 369.98, 499.98, 699.98],
    [3500, 4999.99, 419.98, 599.98, 799.98],
    [5000, 7499.99, 499.98, 739.98, 999.98],
    [7500, 9999.99, 699.98, 1049.98, 1369.98],
    [10000, 19999.99, 1149.98, 1739.98, 2279.98],
    [20000, 34999.99, 1899.98, 2859.98, 3779.98],
    [35000, 50000, 2749.98, 4099.98, 5489.98],
  ],

  [GROUP_TYPES.TRIPLE_PLUS]: [
    [900, 1499.99, 289.98, 439.98, 579.98],
    [1500, 1999.99, 349.98, 499.98, 669.98],
    [2000, 2499.99, 369.98, 529.98, 689.98],
    [2500, 3499.99, 419.98, 599.98, 799.98],
    [3500, 4999.99, 479.98, 699.98, 919.98],
    [5000, 7499.99, 699.98, 999.98, 1339.98],
    [7500, 9999.99, 749.98, 1049.98, 1439.98],
    [10000, 12499.99, 1149.98, 1599.98, 2099.98],
    [12500, 14999.99, 1199.98, 1799.98, 2419.98],
    [15000, 19999.99, 1579.98, 2419.98, 3149.98],
    [20000, 24999.99, 2149.98, 3149.98, 4199.98],
    [25000, 29999.99, 2699.98, 3999.98, 5359.98],
    [30000, 34999.99, 3199.98, 4729.98, 6409.98],
    [35000, 39999.99, 3699.98, 5569.98, 7459.98],
    [40000, 44999.99, 4249.98, 6299.98, 8499.98],
    [45000, 49999.99, 4799.98, 7139.98, 9559.98],
    [50000, 74999.99, 5399.98, 7979.98, 10599.98],
    [75000, 99999.99, 8399.98, 12599.98, 17099.98],
    [100000, 124999.99, 11349.98, 16799.98, 22799.98],
    [125000, 150000.99, 14199.98, 20999.98, 28349.98],
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
