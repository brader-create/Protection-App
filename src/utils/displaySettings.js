// What the home page and the PDF show.
//
// The home page has two modes rather than a switch per section: Simple keeps
// to the answer — the lowest price, its share of the appliance cost, and each
// option's total with a short breakdown by plan type — and Advanced shows
// everything. The PDF has a few choices of its own; Essentials is added to it
// automatically whenever models are starred.

export const HOME_MODES = [
  {
    key: 'simple',
    label: 'Simple',
    summary: 'Just the answer',
    shows: 'Lowest price, % of cost, and each option’s total with a short breakdown. No Save 3%.',
  },
  {
    key: 'advanced',
    label: 'Advanced',
    summary: 'Everything',
    shows: 'Adds Save 3%, % per year, full groupings, Turbo Charge, deal ideas and banners',
  },
];

// The parts of the results Simple leaves out. Everything else shows in both.
const SIMPLE_HIDES = [
  'percentPerYear',
  'percentMeter',
  'groupBreakdown',
  'turboCharge',
  'dealSuggestions',
  'save3',
  'save3Banner',
  'deselectedModels',
];

// Which parts of the results to show for a home mode, as { part: false } for
// each hidden one. Simple swaps the full groupings for a short breakdown.
export function homeVisibility(mode) {
  if (mode !== 'simple') return { compactBreakdown: false };
  return Object.fromEntries(SIMPLE_HIDES.map((part) => [part, false]));
}

// Rows of the PDF's pricing comparison that can be left out.
export const PDF_COMPARE_OPTIONS = [
  { key: 'pdfCompareBestMix', strategy: 'bestMix', label: 'Best Mix' },
  { key: 'pdfCompareSingleBundle', strategy: 'singleBundle', label: 'Single Bundle' },
  { key: 'pdfCompareIndividual', strategy: 'individual', label: 'Individual' },
];

export const PDF_APPLIANCE_STYLES = [
  { key: 'full', label: 'Full list', hint: 'One row per appliance' },
  { key: 'condensed', label: 'Condensed', hint: 'Three across, takes a fraction of the space' },
];

// How the appliance list on the home page is laid out.
export const APPLIANCE_LAYOUTS = [
  { key: 'rows', label: 'Rows', hint: 'One appliance per line' },
  { key: 'cells', label: 'Cells', hint: 'Side by side, up to 4 across depending on how many' },
];

export const DEFAULT_SETTINGS = {
  homeMode: 'advanced',
  applianceLayout: 'rows',
  pdfApplianceStyle: 'full',
  ...Object.fromEntries(PDF_COMPARE_OPTIONS.map((option) => [option.key, true])),
  // % of appliance cost, % per year and savings against Individual on the PDF.
  pdfPercentages: false,
};

const STORAGE_KEY = 'wlc-display-settings';

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Keep only settings that still exist, over the defaults, so a setting
    // added later arrives at its default and a retired one is dropped.
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in stored) settings[key] = stored[key];
    }
    if (!HOME_MODES.some((mode) => mode.key === settings.homeMode)) {
      settings.homeMode = DEFAULT_SETTINGS.homeMode;
    }
    if (!APPLIANCE_LAYOUTS.some((layout) => layout.key === settings.applianceLayout)) {
      settings.applianceLayout = DEFAULT_SETTINGS.applianceLayout;
    }
    if (!PDF_APPLIANCE_STYLES.some((style) => style.key === settings.pdfApplianceStyle)) {
      settings.pdfApplianceStyle = DEFAULT_SETTINGS.pdfApplianceStyle;
    }
    // The comparison needs at least one row.
    if (!PDF_COMPARE_OPTIONS.some((option) => settings[option.key])) {
      for (const option of PDF_COMPARE_OPTIONS) settings[option.key] = true;
    }
    return settings;
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
