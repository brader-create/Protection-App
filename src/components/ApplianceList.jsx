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
  essentialIds,
  onToggleEssential,
  layout = 'rows',
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
        <p className="text-sm mt-1">Add appliances manually or use Read Document above</p>
      </div>
    );
  }

  const enabledAppliances = appliances.filter((a) => !excludedIds.has(a.id));
  const totalCost = enabledAppliances.reduce((sum, a) => sum + a.cost, 0);

  // Cells: as many across as there are appliances, up to 4, fewer on narrow
  // screens. (Spelled out so Tailwind keeps the classes.)
  const cells = layout === 'cells';
  const cellColumns = [
    'grid-cols-1',
    'grid-cols-1 sm:grid-cols-2',
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  ][Math.min(4, appliances.length) - 1];

  return (
    <div>
    <div className={cells ? `grid gap-2 ${cellColumns}` : 'space-y-2'}>
      {appliances.map((app, index) => {
        const isExcluded = excludedIds.has(app.id);
        const isEditing = editingId === app.id;
        const has3 = save3Active && !save3Exclusions.has(app.id);
        const isEssential = essentialIds?.has(app.id) ?? false;
        const discountedCost = Math.round(app.cost * 0.97 * 100) / 100;

        if (isEditing) {
          return (
            <div key={app.id} className={`appliance-row flex-wrap ${cells ? 'col-span-full' : ''}`}>
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

        const includeBox = (
          <input
            type="checkbox"
            checked={!isExcluded}
            onChange={() => onToggle(app.id)}
            className="w-4 h-4 rounded border-slate-600 text-blue-500 bg-slate-700 cursor-pointer accent-blue-500 shrink-0"
            title={isExcluded ? 'Include in calculation' : 'Exclude from calculation'}
          />
        );
        const number = (
          <span className="text-sm font-mono w-6 text-right shrink-0" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
        );
        const name = (
          <span className={`font-medium truncate block ${isExcluded ? 'line-through' : ''}`} style={{ color: isExcluded ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            {app.model}
          </span>
        );
        const description = app.description && (
          <span className="text-xs truncate block" style={{ color: 'var(--text-muted)' }}>{app.description}</span>
        );
        const smallBadge = app.isSmall && <span className="badge-amber text-[10px] shrink-0">Small</span>;
        const star = (
          <button
            onClick={() => onToggleEssential(app.id)}
            className={`p-1 rounded-lg transition-all shrink-0 ${isEssential ? 'text-amber-400' : 'hover:text-amber-400/70'}`}
            style={!isEssential ? { color: 'var(--text-faint)' } : {}}
            title={isEssential ? 'In Essentials — click to remove' : 'Add to Essentials'}
            aria-pressed={isEssential}
          >
            <svg className="w-4 h-4" fill={isEssential ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        );
        const save3Chip = save3Active && (
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
        );
        const cost = (
          <span className={`font-semibold tabular-nums shrink-0 ${has3 ? 'line-through text-sm' : ''}`} style={{ color: isExcluded ? 'var(--text-muted)' : has3 ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        );
        const editButton = (
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
        );
        const removeButton = (
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
        );

        if (cells) {
          // A two-line tile: what it is and what it costs on top, then its
          // description with the badges and actions tucked to the right.
          return (
            <div key={app.id} className={`appliance-cell flex flex-col justify-center gap-1 rounded-xl px-3 py-2.5 transition-opacity ${isExcluded ? 'opacity-35' : ''}`}
              style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-light)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {includeBox}
                <div className="flex-1 min-w-0 text-sm">{name}</div>
                <span className="text-sm">{cost}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0 pl-6">
                <div className="flex-1 min-w-0">
                  {description || <span className="text-xs" style={{ color: 'var(--text-faint)' }}>No description</span>}
                </div>
                {app.isSmall && <span className="badge-amber text-[9px] !px-1.5 !py-0 shrink-0">Small</span>}
                {save3Chip}
                {star}
                {editButton}
                {removeButton}
              </div>
            </div>
          );
        }

        return (
          <div key={app.id} className={`appliance-row transition-opacity ${isExcluded ? 'opacity-35' : ''}`}>
            {includeBox}
            {number}
            <div className="flex-1 min-w-0">
              {name}
              {description}
            </div>
            {smallBadge}
            {star}
            {save3Chip}
            {cost}
            {editButton}
            {removeButton}
          </div>
        );
      })}
    </div>

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
