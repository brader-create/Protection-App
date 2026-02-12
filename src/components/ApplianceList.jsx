export default function ApplianceList({ appliances, onRemove, onUpdate }) {
  if (appliances.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
        <p className="text-lg font-medium">No appliances added yet</p>
        <p className="text-sm mt-1">Add appliances manually or upload a document above</p>
      </div>
    );
  }

  const totalCost = appliances.reduce((sum, a) => sum + a.cost, 0);

  return (
    <div className="space-y-2">
      {appliances.map((app, index) => (
        <div key={app.id} className="appliance-row group">
          <span className="text-slate-500 text-sm font-mono w-6 text-right shrink-0">{index + 1}</span>

          <div className="flex-1 min-w-0">
            <span className="text-slate-100 font-medium truncate block">{app.model}</span>
          </div>

          {app.isSmall && <span className="badge-amber text-[10px] shrink-0">Small</span>}

          <span className="text-slate-100 font-semibold tabular-nums shrink-0">
            ${app.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>

          <button
            onClick={() => onRemove(app.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-600/20 rounded-lg text-slate-500 hover:text-red-400"
            title="Remove appliance"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 mt-3 px-4">
        <span className="text-slate-400 text-sm">{appliances.length} appliance{appliances.length !== 1 ? 's' : ''}</span>
        <span className="text-slate-200 font-bold text-lg tabular-nums">
          Total: ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
