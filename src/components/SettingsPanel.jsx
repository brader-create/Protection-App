import { HOME_MODES } from '../utils/displaySettings';

// The mini page is paper in both themes, so it uses fixed colours rather than
// the theme variables.
const PAPER = {
  ink: '#334155',
  line: '#cbd5e1',
  lineDark: '#94a3b8',
  fill: '#f1f5f9',
  amber: '#b45309',
  amberFill: '#fef3c7',
};

function OnOffMark({ on }) {
  return on ? (
    <span className="ml-auto shrink-0 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
      </svg>
    </span>
  ) : (
    <span className="ml-auto shrink-0 text-[8px] font-bold uppercase tracking-wide" style={{ color: PAPER.lineDark }}>Off</span>
  );
}

// One section of the mini page. On: drawn like the PDF section. Off: a dashed
// placeholder, so it can be turned back on where it would sit.
function Section({ on, label, name = label, onToggle, grow, accent, note, children }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={on ? `Hide ${name.toLowerCase()} on the PDF` : `Show ${name.toLowerCase()} on the PDF`}
      className="w-full text-left rounded-[3px] px-1.5 py-1 flex flex-col gap-[3px] transition-all hover:ring-2 hover:ring-[#60a5fa99] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      style={{
        flexGrow: grow,
        minHeight: 0,
        border: on ? '1px solid transparent' : `1px dashed ${PAPER.lineDark}`,
        background: on ? (accent ? PAPER.amberFill : PAPER.fill) : 'transparent',
        opacity: on ? 1 : 0.55,
      }}
    >
      <span className="flex items-center gap-1 text-[9px] font-semibold leading-none" style={{ color: accent ? PAPER.amber : PAPER.ink }}>
        {label}
        {note && <span className="font-normal" style={{ color: PAPER.lineDark }}>· {note}</span>}
        <OnOffMark on={on} />
      </span>
      {on && <span className="flex-1 min-h-0 overflow-hidden flex flex-col gap-[3px]">{children}</span>}
    </button>
  );
}

const Bar = ({ w = '100%', h = 3, color = PAPER.line }) => (
  <span className="block rounded-sm shrink-0" style={{ width: w, height: h, background: color }} />
);

function PdfLayoutPreview({ settings, onChange, essentialCount }) {
  const on = (key) => settings[key] !== false;
  const flip = (key) => () => onChange(key, !on(key));

  const essentialsNote = !on('pdfEssentials')
    ? null
    : essentialCount > 0
      ? `${essentialCount} starred`
      : 'star models to fill';

  return (
    <div
      className="mx-auto w-full max-w-[230px] bg-white rounded-sm shadow-xl flex flex-col"
      style={{ aspectRatio: '210 / 297', boxShadow: '0 10px 30px rgba(2,6,23,0.35)' }}
    >
      {/* Header band, with the date as its own switch */}
      <div className="shrink-0 flex items-end justify-between px-[7%] pb-2 pt-3" style={{ background: '#0f172a', height: '13%' }}>
        <span className="flex flex-col gap-1">
          <Bar w={64} h={5} color="#e2e8f0" />
          <Bar w={38} h={3} color="#64748b" />
        </span>
        <button
          type="button"
          onClick={flip('pdfDate')}
          aria-pressed={on('pdfDate')}
          title={on('pdfDate') ? 'Hide the date on the PDF' : 'Show the date on the PDF'}
          className="text-[8px] font-semibold leading-none px-1.5 py-1 rounded-sm transition-all hover:ring-2 hover:ring-[#60a5fab3]"
          style={{
            color: on('pdfDate') ? '#cbd5e1' : '#475569',
            border: on('pdfDate') ? '1px solid #334155' : '1px dashed #475569',
            textDecoration: on('pdfDate') ? 'none' : 'line-through',
          }}
        >
          Date
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-[5px] px-[7%] pt-[5%] pb-[3%]">
        {/* Appliances covered, with its total row as a separate switch */}
        <div className="flex flex-col gap-[2px]" style={{ flexGrow: 3, minHeight: 0 }}>
          <Section on={on('pdfApplianceList')} label="Appliances" onToggle={flip('pdfApplianceList')} grow={1}>
            <Bar h={4} color={PAPER.ink} />
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="flex justify-between gap-2">
                <Bar w="55%" />
                <Bar w="18%" color={PAPER.lineDark} />
              </span>
            ))}
          </Section>
          <button
            type="button"
            onClick={flip('pdfApplianceTotal')}
            aria-pressed={on('pdfApplianceTotal')}
            title={on('pdfApplianceTotal') ? 'Hide total rows on the PDF' : 'Show total rows on the PDF'}
            className="shrink-0 flex items-center gap-1 px-1.5 py-[3px] rounded-[3px] text-[8px] font-semibold leading-none transition-all hover:ring-2 hover:ring-[#60a5fa99]"
            style={{
              color: PAPER.ink,
              background: on('pdfApplianceTotal') ? '#e2e8f0' : 'transparent',
              border: on('pdfApplianceTotal') ? '1px solid transparent' : `1px dashed ${PAPER.lineDark}`,
              opacity: on('pdfApplianceTotal') ? 1 : 0.55,
            }}
          >
            Total row
            <OnOffMark on={on('pdfApplianceTotal')} />
          </button>
        </div>

        <Section on={on('pdfComparisonTable')} label="Pricing comparison" onToggle={flip('pdfComparisonTable')} grow={1.6}>
          <Bar h={4} color={PAPER.ink} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex gap-1.5">
              <Bar w="28%" color={PAPER.lineDark} />
              <Bar w="20%" color={i === 0 ? '#10b981' : PAPER.line} />
              <Bar w="20%" color={i === 0 ? '#10b981' : PAPER.line} />
              <Bar w="20%" color={i === 0 ? '#10b981' : PAPER.line} />
            </span>
          ))}
        </Section>

        <Section on={on('pdfBreakdown')} label="Best option breakdown" onToggle={flip('pdfBreakdown')} grow={2}>
          <span className="flex gap-1 flex-1 min-h-0">
            {[0, 1, 2].map((col) => (
              <span key={col} className="flex-1 flex flex-col gap-[3px]">
                <Bar h={4} color="#e2e8f0" />
                <Bar w="80%" color={PAPER.lineDark} />
                <Bar w="60%" />
                <Bar w="70%" />
                <Bar w="55%" />
              </span>
            ))}
          </span>
        </Section>

        <Section
          on={on('pdfEssentials')}
          label="★ Essentials"
          name="Essentials"
          note={essentialsNote}
          accent
          onToggle={flip('pdfEssentials')}
          grow={1.7}
        >
          <span className="flex gap-1.5 flex-1 min-h-0">
            <span className="flex flex-col gap-[3px]" style={{ width: '58%' }}>
              <Bar h={4} color={PAPER.amber} />
              <Bar w="80%" color="#fcd34d" />
              <Bar w="65%" color="#fcd34d" />
            </span>
            <span className="flex flex-col gap-[3px] flex-1">
              <Bar h={4} color={PAPER.amber} />
              <Bar color="#fcd34d" />
              <Bar color="#fcd34d" />
              <Bar color="#fcd34d" />
            </span>
          </span>
        </Section>
      </div>

      {/* Footer line */}
      <div className="shrink-0 flex justify-center pb-[4%]">
        <Bar w="45%" h={2} color={PAPER.line} />
      </div>
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, onReset, onClose, essentialCount = 0 }) {
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
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Home page</p>
            <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--text-faint)' }}>How much the results show</p>

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

          {/* PDF: the page itself, each section a switch */}
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>PDF download</p>
            <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--text-faint)' }}>Tap a section to turn it on or off</p>
            <PdfLayoutPreview settings={settings} onChange={onChange} essentialCount={essentialCount} />
            <p className="text-[11px] text-center mt-3 flex items-center justify-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Always fits on one page
            </p>
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
