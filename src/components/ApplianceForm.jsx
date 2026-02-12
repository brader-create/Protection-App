import { useState } from 'react';

export default function ApplianceForm({ onAdd }) {
  const [model, setModel] = useState('');
  const [cost, setCost] = useState('');
  const [isSmall, setIsSmall] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const numCost = parseFloat(cost.replace(/[,$]/g, ''));
    if (!model.trim() || isNaN(numCost) || numCost <= 0) return;

    onAdd({
      id: crypto.randomUUID(),
      model: model.trim(),
      cost: numCost,
      isSmall,
    });

    setModel('');
    setCost('');
    setIsSmall(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="block text-sm text-slate-400 mb-1.5 font-medium">Model / Description</label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. Samsung RF28 Refrigerator"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1.5 font-medium">Cost ($)</label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. 1,299.99"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-800/50 border border-slate-700/30 rounded-xl px-4 py-3 hover:bg-slate-800/80 transition-all">
            <input
              type="checkbox"
              checked={isSmall}
              onChange={(e) => setIsSmall(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500/50 bg-slate-700 cursor-pointer"
            />
            <span className="text-sm text-slate-300 whitespace-nowrap">Small Appliance</span>
          </label>
        </div>

        <div className="flex items-end">
          <button type="submit" className="btn-primary whitespace-nowrap">
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
