import { useMemo, useState } from 'react';
import { PROMO_YEARS, PROMO_BADGES, REBATE_RATE, calculateHolidayTerm, promoCounts } from '../utils/holidayPromo';
import { generateHolidayPDF } from '../utils/holidayPdf';

function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const termLabel = (yr) => `${yr}-Year Additional`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PromoChip({ level }) {
  const badge = PROMO_BADGES[level];
  if (!badge) return null;
  return (
    <span className={`promo-chip promo-chip-${level}`}>
      <span aria-hidden="true">{badge.icon}</span>
      {badge.short}
    </span>
  );
}

function TermCard({ term, years, selected, loading, onSelect }) {
  return (
    <button
      onClick={onSelect}
      disabled={!term}
      aria-pressed={selected}
      className={`holiday-term text-left rounded-xl p-4 transition-all ${selected ? 'holiday-term-selected' : ''} ${!term ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {termLabel(years)}
      </div>
      {loading ? (
        <div className="mt-3 w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
      ) : term ? (
        <>
          <div className="holiday-total text-2xl font-bold tabular-nums mt-1">{formatPrice(term.total)}</div>
          <div className="mt-2 space-y-0.5 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {term.free.length > 0 && (
              <div>
                <span aria-hidden="true">🎁 </span>
                {plural(term.free.length, 'model')} free · {formatPrice(term.freeValue)} value
              </div>
            )}
            {term.rebate && (
              <div>
                <span aria-hidden="true">🎄 </span>
                20% rebate −{formatPrice(term.rebate.amount)}
              </div>
            )}
            {term.free.length === 0 && !term.rebate && (
              <div style={{ color: 'var(--text-faint)' }}>No promotion at this term</div>
            )}
          </div>
        </>
      ) : null}
    </button>
  );
}

function TermDetail({ term }) {
  const { years, free, freeValue, plan, rebate, subtotal, total } = term;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        {/* Covered free */}
        <section className="holiday-section rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              <span aria-hidden="true">🎁 </span>Free with the promotion
            </h4>
            {free.length > 0 && (
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {formatPrice(freeValue)} value
              </span>
            )}
          </div>
          {free.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              No model’s free years reach {years} additional year{years === 1 ? '' : 's'}.
            </p>
          ) : (
            <div className="space-y-1">
              {free.map(({ appliance, freeYears, value }) => (
                <div key={appliance.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{appliance.model}</span>
                    <PromoChip level={freeYears} />
                  </span>
                  <span className="tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                    <span className="line-through">{formatPrice(value)}</span>
                    <span className="holiday-free ml-2 font-semibold">FREE</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* What's paid for, bundled the cheapest way */}
        <section className="holiday-section rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Best bundle for the rest
            </h4>
            {plan && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {years === 1 ? 'Each on its own' : plan.label}
              </span>
            )}
          </div>
          {!plan ? (
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {term.paid.length === 0 ? 'Nothing to pay for — every model is covered free.' : 'No price for these models at this term.'}
            </p>
          ) : (
            <div className="space-y-2">
              {plan.items.map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    <span>{item.groupLabel}</span>
                    <span className="tabular-nums">{formatPrice(item.price)}</span>
                  </div>
                  <div className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                    {item.appliances.map((a) => a.model).join(', ')}
                  </div>
                </div>
              ))}
              {years === 1 && (
                <p className="text-[11px] italic" style={{ color: 'var(--text-faint)' }}>
                  One additional year is sold per appliance only.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* The totals, with the rebate on its own line */}
      <section className="holiday-section rounded-xl p-4 h-fit">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          {termLabel(years)} — what the customer pays
        </h4>
        <div className="space-y-2 text-sm tabular-nums">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>
              Best bundle ({plural(term.paid.length, 'model')})
            </span>
            <span style={{ color: 'var(--text-primary)' }}>{formatPrice(subtotal)}</span>
          </div>
          {rebate && (
            <div>
              <div className="flex items-center justify-between">
                <span className="holiday-rebate font-medium">{Math.round(REBATE_RATE * 100)}% holiday rebate</span>
                <span className="holiday-rebate font-semibold">−{formatPrice(rebate.amount)}</span>
              </div>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                {rebate.bundle
                  ? `20% of ${formatPrice(rebate.bundle.price)}: the ${plural(rebate.appliances.length, 'qualifying model')} as one ${rebate.bundle.groupLabel} plan`
                  : 'No bundle price for the qualifying models'}
                {' '}({rebate.appliances.map((a) => a.model).join(', ')}). Replaces their free years.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--border-main)' }}>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
            <span className="holiday-total text-xl font-bold">{formatPrice(total)}</span>
          </div>
          {free.length > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Plus {plural(free.length, 'model')} covered free ({formatPrice(freeValue)} value).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The holiday promotion: the price per term with models marked 🎁 +1 / 🎅 +2
 * covered free, the 20% rebate for qualifying models taken further, and the
 * split for the chosen term. Built on the regular results, so it reflects the
 * same models and any Save 3%.
 */
export default function HolidayPanel({ allResults, promoYears, calculating, activeYear, onYearChange }) {
  const byYear = allResults?.byYear;
  const [selected, setSelected] = useState(activeYear ?? 4);
  const [generating, setGenerating] = useState(false);

  // The models exactly as the regular results priced them.
  const priced = useMemo(() => {
    const anyYear = byYear && Object.values(byYear)[0];
    return anyYear ? anyYear.individual.items.map((item) => item.appliances[0]) : [];
  }, [byYear]);

  // Each regular term is worked out once its regular result is in, so the two
  // never disagree; one additional year needs no regular result.
  const terms = useMemo(() => {
    const out = {};
    if (priced.length === 0) return out;
    for (const yr of PROMO_YEARS) {
      if (yr === 1 || byYear[yr]) out[yr] = calculateHolidayTerm(priced, promoYears, yr, byYear[yr]);
    }
    return out;
  }, [priced, promoYears, byYear]);

  const counts = promoCounts(priced, promoYears);
  const allReady = PROMO_YEARS.every((yr) => terms[yr]);
  const shown = terms[selected];

  function select(yr) {
    setSelected(yr);
    if (yr !== 1) onYearChange?.(yr);
  }

  function handleDownload() {
    setGenerating(true);
    setTimeout(() => {
      try {
        generateHolidayPDF(priced, promoYears, terms);
      } catch (err) {
        console.error('Christmas PDF error:', err);
      }
      setGenerating(false);
    }, 50);
  }

  if (priced.length === 0) return null;

  return (
    <div className="card holiday-card overflow-hidden">
      <div className="holiday-stripe" aria-hidden="true" />
      <div className="card-body space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              <span aria-hidden="true">🎄 </span>Holiday Promotion
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {counts.qualifying === 0 ? (
                <>Mark the models that qualify with <strong>🎁 +1</strong> or <strong>🎅 +2</strong> in the list above.</>
              ) : (
                <>
                  {[
                    counts.plusOne > 0 && `${plural(counts.plusOne, 'model')} with 1 free year`,
                    counts.plusTwo > 0 && `${plural(counts.plusTwo, 'model')} with 2 free years`,
                  ].filter(Boolean).join(' · ')}
                  {' '}— past the free years they get a 20% rebate instead.
                </>
              )}
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={generating || !allReady}
            className="btn-christmas text-sm flex items-center gap-2"
            title={allReady ? 'A one-page holiday offer with the full split' : 'Waiting for every term to finish'}
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <span aria-hidden="true">🎁</span>
                Download Christmas PDF
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PROMO_YEARS.map((yr) => (
            <TermCard
              key={yr}
              years={yr}
              term={terms[yr]}
              selected={yr === selected}
              loading={!terms[yr] && calculating}
              onSelect={() => select(yr)}
            />
          ))}
        </div>

        {shown ? (
          <TermDetail term={shown} />
        ) : (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
            Working out {termLabel(selected)}…
          </div>
        )}
      </div>
    </div>
  );
}
