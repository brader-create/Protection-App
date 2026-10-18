import { MAIN_PAGE_SECTIONS, PDF_SECTIONS, DEFAULT_SETTINGS } from '../utils/displaySettings';

function ToggleRow({ section, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 py-2 px-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(section.key, e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500/50 cursor-pointer accent-blue-500"
      />
      <span className="min-w-0">
        <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>{section.label}</span>
        {section.hint && (
          <span className="block text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{section.hint}</span>
        )}
      </span>
    </label>
  );
}

export default function SettingsPanel({ settings, onChange, onReset, onClose }) {
  const groups = [
    { title: 'Main page', subtitle: 'What appears in the results', sections: MAIN_PAGE_SECTIONS },
    { title: 'PDF download', subtitle: 'What goes into the downloaded file', sections: PDF_SECTIONS },
  ];

  const hiddenCount = Object.keys(DEFAULT_SETTINGS).filter((key) => !settings[key]).length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: 'rgba(2, 6, 23, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl my-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-main)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Display Settings</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {hiddenCount === 0 ? 'Everything is showing' : `${hiddenCount} item${hiddenCount === 1 ? '' : 's'} hidden`}
            </p>
          </div>
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

        <div className="px-5 py-4 grid gap-6 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{group.title}</p>
              <p className="text-xs mb-2" style={{ color: 'var(--text-faint)' }}>{group.subtitle}</p>
              <div className="rounded-xl p-1" style={{ background: 'var(--bg-card-inner)' }}>
                {group.sections.map((section) => (
                  <ToggleRow
                    key={section.key}
                    section={section}
                    checked={settings[section.key] !== false}
                    onChange={onChange}
                  />
                ))}
              </div>
            </div>
          ))}
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
