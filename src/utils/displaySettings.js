// What the home page and the PDF show.
//
// The home page has two modes rather than a switch per section: Simple keeps
// to the answer — the lowest price, what it is as a share of the appliances,
// and each option's total — and Advanced shows everything. The PDF keeps a
// switch per section, which the settings show as a small page layout.

export const HOME_MODES = [
  {
    key: 'simple',
    label: 'Simple',
    summary: 'Just the answer',
    shows: 'Lowest price, % of cost, % per year, and each option’s total',
  },
  {
    key: 'advanced',
    label: 'Advanced',
    summary: 'Everything',
    shows: 'Adds groupings, Turbo Charge, deal ideas, the % bar and savings banners',
  },
];

// The parts of the results Simple leaves out. Everything else shows in both.
const SIMPLE_HIDES = [
  'percentMeter',
  'groupBreakdown',
  'turboCharge',
  'dealSuggestions',
  'save3Banner',
  'deselectedModels',
];

// Which parts of the results to show for a home mode, as { part: false } for
// each hidden one.
export function homeVisibility(mode) {
  if (mode !== 'simple') return {};
  return Object.fromEntries(SIMPLE_HIDES.map((part) => [part, false]));
}

export const PDF_SECTIONS = [
  { key: 'pdfDate', label: 'Date' },
  { key: 'pdfApplianceList', label: 'Appliances covered' },
  { key: 'pdfApplianceTotal', label: 'Total' },
  { key: 'pdfComparisonTable', label: 'Pricing comparison' },
  { key: 'pdfBreakdown', label: 'Best option breakdown' },
  { key: 'pdfEssentials', label: 'Essentials', default: false },
];

export const DEFAULT_SETTINGS = {
  homeMode: 'advanced',
  ...Object.fromEntries(PDF_SECTIONS.map((section) => [section.key, section.default !== false])),
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
