import { WARRANTY_YEARS } from '../data/warrantyPricing';

export default function YearSelector({ selected, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-400 font-medium mr-1">Coverage Term:</span>
      {WARRANTY_YEARS.map((year) => (
        <button
          key={year}
          onClick={() => onChange(year)}
          className={selected === year ? 'tab-button-active' : 'tab-button-inactive'}
        >
          {year} Year{year !== 1 ? 's' : ''}
        </button>
      ))}
    </div>
  );
}
