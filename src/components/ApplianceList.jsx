import { useState } from 'react';

export default function ApplianceList({
  appliances,
  onRemove,
  onUpdate,
  excludedIds,
  onToggle,
  save3Active,
  save3Exclusions,
  onToggle3,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editModel, setEditModel] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editSmall, setEditSmall] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  function startEdit(app) {
    setEditingId(app.id);
    setEditModel(app.model);
    setEditCost(app.cost.toString());
    setEditSmall(app.isSmall);
    setEditDescription(app.description || '');
  }

  function saveEdit() {
    const numCost = parseFloat(editCost.replace(/[,$]/g, ''));
    if (!editModel.trim() || isNaN(numCost) || numCost <= 0) return;
    onUpdate(editingId, { model: editModel.trim(), cost: numCost, isSmall: editSmall, description: editDescription.trim() });
    setEditingId(null);
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingId(null);
  }

  if (appliances.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
        <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p className="text-lg font-medium">No appliances added yet</p>
        <p className="text-sm mt-1">Add appliances manually or upload a document above</p>
      </div>
    );
  }

  const enabledAppliances = appliances.filter((a) => !excludedIds.has(a.id));
  const totalCost = enabledAppliances.reduce((sum, a) => sum + a.cost, 0);

  return (
    <div className="space-y-2">
      {appliances.map((app, index) => {
        const isExcluded = excludedIds.has(app.id);
        const isEditing = editingId === app.id;
        const has3 = save3Active && !save3Exclusions.has(app.id);
        const discountedCost = Math.round(app.cost * 0.97 * 100) / 100;

        if (isEditing) {
          return (
            <div key={app.id} className="appliance-row flex-wrap">
              <span className="text-sm font-mono w-6 text-right shrink-0" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
              <input
                type="text"
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="input-field !py-1.5 !px-3 flex-1 min-w-0 text-sm"
                placeholder="Model"
                autoFocus
              />
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="input-field !py-1.5 !px-3 flex-1 min-w-0 text-sm"
                placeholder="Description (optional)"
              />
              <input
                type="text"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="input-field !py-1.5 !px-3 w-28 text-sm text-right"
                placeholder="Cost"
              />
              <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={editSmall}
                  onChange={(e) => setEditSmall(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-600 text-amber-500 bg-slate-700 cursor-pointer accent-amber-500"
                />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Small</span>
              </label>
              <button onClick={saveEdit} className="p-1.5 hover:bg-emerald-600/20 rounded-lg text-emerald-400 transition-colors" title="Save">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={() => setEditingId(null)} className="p-1.5 hover:bg-red-600/20 rounded-lg text-slate-500 hover:text-red-400 transition-colors" title="Cancel">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        }

        return (
          <div key={app.id} className={`appliance-row transition-opacity ${isExcluded ? 'opacity-35' : ''}`}>
            <input
              type="checkbox"
              checked={!isExcluded}
              onChange={() => onToggle(app.id)}
              className="w-4 h-4 rounded border-slate-600 text-blue-500 bg-slate-700 cursor-pointer accent-blue-500 shrink-0"
              title={isExcluded ? 'Include in calculation' : 'Exclude from calculation'}
            />

            <span className="text-sm font-mono w-6 text-right shrink-0" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>

            <div className="flex-1 min-w-0">
              <span className={`font-medium truncate block ${isExcluded ? 'line-through' : ''}`} style={{ color: isExcluded ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {app.model}
              </span>
              {app.description && (
                <span className="text-xs truncate block" style={{ color: 'var(--text-muted)' }}>{app.description}</span>
              )}
            </div>

            {app.isSmall && <span className="badge-amber text-[10px] shrink-0">Small</span>}

            {save3Active && (
              <button
                onClick={() => onToggle3(app.id)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all shrink-0 flex items-center gap-1 ${
                  has3
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800/50 text-slate-600 border-slate-700/30 hover:text-slate-400'
                }`}
                title={has3 ? `3% off: $${discountedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Click to include in 3% savings'}
              >
                3%
                {has3 && (
                  <span className="tabular-nums">${discountedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                )}
              </button>
            )}

            <span className={`font-semibold tabular-nums shrink-0 ${has3 ? 'line-through text-sm' : ''}`} style={{ color: isExcluded ? 'var(--text-muted)' : has3 ? 'var(--text-muted)' : 'var(--text-primary)' }}>
              ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>

            <button
              onClick={() => startEdit(app)}
              className="p-1.5 hover:bg-blue-600/20 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Edit appliance"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            <button
              onClick={() => onRemove(app.id)}
              className="p-1.5 hover:bg-red-600/20 rounded-lg hover:text-red-400 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Remove appliance"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-3 mt-3 px-4" style={{ borderTop: '1px solid var(--border-main)' }}>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {excludedIds.size > 0
            ? `${enabledAppliances.length} of ${appliances.length} appliance${appliances.length !== 1 ? 's' : ''} selected`
            : `${appliances.length} appliance${appliances.length !== 1 ? 's' : ''}`}
        </span>
        <span className="font-bold text-lg tabular-nums" style={{ color: 'var(--text-primary)' }}>
          Total: ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
