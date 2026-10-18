// Which parts of the results and the PDF are shown. Everything defaults to
// visible except the Essentials section on the PDF, which is opt-in.

export const MAIN_PAGE_SECTIONS = [
  { key: 'bestPriceBanner', label: 'Lowest available price', hint: 'The green banner at the top of the results' },
  { key: 'percentOfCost', label: 'Percent of appliance cost', hint: 'Shown beside the lowest price' },
  { key: 'percentPerYear', label: 'Percent per year', hint: 'The same figure divided by the term' },
  { key: 'percentMeter', label: 'Percent bar', hint: 'The bar under the lowest price' },
  { key: 'bestMixCard', label: 'Best Mix option' },
  { key: 'singleBundleCard', label: 'Single Bundle option' },
  { key: 'individualCard', label: 'Individual option' },
  { key: 'groupBreakdown', label: 'Group breakdown', hint: 'The appliance lists inside each option' },
  { key: 'essentialsCard', label: 'Essentials recommendation', hint: 'Best bundle for the models you star' },
  { key: 'turboCharge', label: 'Turbo Charge', hint: 'The button and its savings banner' },
  { key: 'dealSuggestions', label: 'Next deal suggestions' },
  { key: 'save3Banner', label: 'Save 3% banner' },
  { key: 'deselectedModels', label: 'Deselected models list' },
];

export const PDF_SECTIONS = [
  { key: 'pdfApplianceList', label: 'Appliances covered', hint: 'The table of models and costs' },
  { key: 'pdfComparisonTable', label: 'Pricing comparison', hint: 'Each option across 2, 3 and 4 years' },
  { key: 'pdfBreakdown', label: 'Best option breakdown', hint: 'The three columns of groupings' },
  { key: 'pdfEssentials', label: 'Essentials recommendation', hint: 'Off by default', default: false },
  { key: 'pdfApplianceTotal', label: 'Appliance cost total' },
  { key: 'pdfDate', label: 'Date in the header' },
];

export const ALL_SECTIONS = [...MAIN_PAGE_SECTIONS, ...PDF_SECTIONS];

export const DEFAULT_SETTINGS = Object.fromEntries(
  ALL_SECTIONS.map((section) => [section.key, section.default !== false]),
);

const STORAGE_KEY = 'wlc-display-settings';

export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    // Merge over the defaults so a setting added later is on rather than missing.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private window, blocked site data); the
    // settings still apply for this visit.
  }
}
