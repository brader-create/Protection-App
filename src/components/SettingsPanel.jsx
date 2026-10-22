import { HOME_MODES, PDF_APPLIANCE_STYLES, PDF_COMPARE_OPTIONS } from '../utils/displaySettings';

function GroupHeading({ title, subtitle }) {
  return (
    <>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
      <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--text-faint)' }}>{subtitle}</p>
    </>
  );
}

function FieldLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{children}</p>
  );
}

// A row of buttons where exactly one is chosen.
function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-main)' }}>
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.key)}
            title={option.hint}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${selected ? 'bg-blue-600 text-white shadow' : 'hover:opacity-80'}`}
            style={!selected ? { color: 'var(--text-muted)' } : {}}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SwitchRow({ label, hint, on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all hover:opacity-90"
      style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-main)' }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{hint}</span>
      </span>
      <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-blue-600' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function SettingsPanel({ settings, onChange, onReset, onClose, essentialCount = 0 }) {
  const comparedCount = PDF_COMPARE_OPTIONS.filter((option) => settings[option.key] !== false).length;
  const applianceStyle = PDF_APPLIANCE_STYLES.find((style) => style.key === settings.pdfApplianceStyle);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-8 overflow-y-auto backdrop-blur-sm"
      style={{ background: 'rgba(2, 6, 23, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl my-auto"
        // The card colour is slightly see-through; lay it over the solid page
        // colour so the results behind can't show through the dialog.
        style={{
          background: 'linear-gradient(var(--bg-card), var(--bg-card)), var(--bg-base)',
          border: '1px solid var(--border-main)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Display settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-main)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Display Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 grid gap-8 sm:grid-cols-2">
          {/* Home page: one choice, Simple or Advanced */}
          <div>
            <GroupHeading title="Home page" subtitle="How much the results show" />

            <div role="radiogroup" aria-label="Home page detail" className="space-y-2">
              {HOME_MODES.map((mode) => {
                const selected = settings.homeMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange('homeMode', mode.key)}
                    className={`w-full text-left rounded-xl p-3.5 border-2 transition-all ${
                      selected ? 'border-blue-500 bg-blue-500/10' : 'hover:border-slate-500'
                    }`}
                    style={!selected ? { borderColor: 'var(--border-main)', background: 'var(--bg-card-inner)' } : {}}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-blue-500' : 'border-slate-500'
                        }`}
                      >
                        {selected && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{mode.label}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— {mode.summary}</span>
                    </span>
                    <span className="block text-xs mt-1.5 pl-[26px]" style={{ color: 'var(--text-faint)' }}>{mode.shows}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PDF download */}
          <div className="space-y-5">
            <div>
              <GroupHeading title="PDF download" subtitle="Always fits on one page" />

              <FieldLabel>Appliances covered</FieldLabel>
              <Segmented
                label="Appliances covered"
                options={PDF_APPLIANCE_STYLES}
                value={settings.pdfApplianceStyle}
                onChange={(value) => onChange('pdfApplianceStyle', value)}
              />
              {applianceStyle && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>{applianceStyle.hint}</p>
              )}
            </div>

            <div>
              <FieldLabel>Options to compare</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {PDF_COMPARE_OPTIONS.map((option) => {
                  const on = settings[option.key] !== false;
                  // Keep at least one option in the comparison.
                  const locked = on && comparedCount === 1;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={on}
                      disabled={locked}
                      onClick={() => onChange(option.key, !on)}
                      title={locked ? 'At least one option stays in the comparison' : on ? `Leave ${option.label} off the PDF` : `Show ${option.label} on the PDF`}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-all ${
                        on ? 'border-blue-500/60 bg-blue-500/15 text-blue-300' : 'hover:opacity-80'
                      } ${locked ? 'cursor-not-allowed' : ''}`}
                      style={!on ? { borderColor: 'var(--border-main)', color: 'var(--text-muted)' } : {}}
                    >
                      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${on ? 'bg-blue-500' : 'border border-slate-500'}`}>
                        {on && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-main)' }}>
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Essentials</span> is added to the PDF
                automatically when you star models.{' '}
                {essentialCount > 0
                  ? `${essentialCount}\u00a0starred now.`
                  : 'None starred yet.'}
              </p>
            </div>

            <SwitchRow
              label="Percentages & savings"
              hint="% of appliance cost, % per year, and savings against Individual"
              on={settings.pdfPercentages === true}
              onToggle={() => onChange('pdfPercentages', !settings.pdfPercentages)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t" style={{ borderColor: 'var(--border-main)' }}>
          <button onClick={onReset} className="btn-secondary text-sm py-2">
            Reset to defaults
          </button>
          <button onClick={onClose} className="btn-primary text-sm py-2 px-6">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
