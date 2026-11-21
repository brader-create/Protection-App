import { useState } from 'react';

// The Christmas theme's decorations. All of it is for looks only: nothing
// here can be clicked, and none of it covers the content. Colours come from
// CSS variables, so each piece suits dark and light mode.

// A fixed pseudo-random sequence, so the snow and stars land in the same
// places on every render.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const FLAKES = (() => {
  const rand = seeded(11);
  const glyphs = ['❄', '❅', '❆', '•', '•', '❄'];
  return Array.from({ length: 56 }, () => ({
    left: rand() * 100,
    size: 9 + rand() * 17,
    fall: 10 + rand() * 16,
    delay: -rand() * 26,
    sway: 2.5 + rand() * 3.5,
    opacity: 0.45 + rand() * 0.55,
    glyph: glyphs[Math.floor(rand() * glyphs.length)],
  }));
})();

const STARS = (() => {
  const rand = seeded(29);
  return Array.from({ length: 40 }, () => ({
    left: rand() * 100,
    top: rand() * 70,
    size: 1 + rand() * 2.2,
    delay: -rand() * 4,
    twinkle: 2 + rand() * 3,
  }));
})();

/** The sky behind the page: stars and a moon at night, and falling snow. */
export function ChristmasBackdrop() {
  return (
    <div className="xmas-backdrop" aria-hidden="true">
      <div className="xmas-moon" />
      {STARS.map((star, i) => (
        <span
          key={`s${i}`}
          className="xmas-star"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.twinkle}s`,
          }}
        />
      ))}
      {FLAKES.map((flake, i) => (
        <span
          key={`f${i}`}
          className="xmas-flake"
          style={{
            left: `${flake.left}%`,
            fontSize: flake.size,
            opacity: flake.opacity,
            animationDuration: `${flake.fall}s`,
            animationDelay: `${flake.delay}s`,
          }}
        >
          <span className="xmas-flake-sway" style={{ animationDuration: `${flake.sway}s` }}>
            {flake.glyph}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A string of twinkling coloured lights hanging under the header. */
export function ChristmasLights() {
  return (
    <div className="xmas-lights" aria-hidden="true">
      {Array.from({ length: 70 }, (_, i) => (
        <span key={i} className="xmas-socket">
          <i className={`xmas-bulb xmas-bulb-${i % 5}`} style={{ animationDelay: `${(i % 7) * 0.31}s` }} />
        </span>
      ))}
    </div>
  );
}

/** A Santa hat perched on the logo. */
export function SantaHat() {
  return (
    <svg className="santa-hat" viewBox="0 0 34 30" aria-hidden="true">
      <path d="M5 23 C8 11 16 3 27 6 C25 10 25 16 27 21 Z" fill="#dc2626" />
      <path d="M16 8 C20 6 24 5 27 6 C25 10 25 16 27 21 L22 22 C21 16 19 11 16 8 Z" fill="#b91c1c" />
      <circle cx="28.5" cy="6.5" r="4" fill="#ffffff" />
      <rect x="2" y="19.5" width="27" height="8" rx="4" fill="#ffffff" />
      <rect x="2" y="24" width="27" height="3.5" rx="1.75" fill="#e2e8f0" />
    </svg>
  );
}

/** Days to go until Christmas, or a greeting on and after the day. */
export function ChristmasCountdown() {
  const [today] = useState(() => new Date());
  const month = today.getMonth();
  const day = today.getDate();

  let text;
  if (month === 11 && day === 25) text = '🎄 Merry Christmas!';
  else if (month === 11 && day === 24) text = '🎅 Christmas Eve!';
  else if (month === 11 && day > 25) text = '✨ Happy Holidays!';
  else if (month === 0 && day <= 7) text = '🎆 Happy New Year!';
  else {
    const start = new Date(today.getFullYear(), month, day);
    const christmas = new Date(today.getFullYear(), 11, 25);
    const days = Math.round((christmas - start) / 86400000);
    text = `🎅 ${days} day${days === 1 ? '' : 's'} until Christmas`;
  }
  // Left off on a phone, where the title already fills the header.
  return <span className="xmas-countdown hidden sm:inline">{text}</span>;
}

// --- The winter village at the bottom of the page ---

function Tree({ x, y, s = 1, lights = false, star = false, far = false }) {
  const tiers = [
    [-22, -8, -34],
    [-17, -24, -48],
    [-12, -38, -60],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-9" width="6" height="9" className="scene-trunk" />
      {tiers.map(([w, base, tip], i) => (
        <g key={i}>
          <polygon points={`${w},${base} ${-w},${base} 0,${tip}`} className={far ? 'scene-tree-far' : 'scene-tree'} />
          {/* Snow on each tier's tip */}
          <polygon
            points={`0,${tip} ${w * 0.38},${tip + (base - tip) * 0.38} ${w * 0.15},${tip + (base - tip) * 0.3} 0,${tip + (base - tip) * 0.4} ${-w * 0.15},${tip + (base - tip) * 0.3} ${-w * 0.38},${tip + (base - tip) * 0.38}`}
            className="scene-snow"
          />
        </g>
      ))}
      {lights && (
        <g>
          <circle cx="-9" cy="-16" r="2" fill="#ef4444" className="scene-light" />
          <circle cx="8" cy="-20" r="2" fill="#facc15" className="scene-light scene-light-2" />
          <circle cx="-5" cy="-31" r="1.8" fill="#3b82f6" className="scene-light scene-light-3" />
          <circle cx="6" cy="-36" r="1.8" fill="#22c55e" className="scene-light" />
          <circle cx="-2" cy="-46" r="1.6" fill="#f97316" className="scene-light scene-light-2" />
          <circle cx="15" cy="-12" r="2" fill="#a855f7" className="scene-light scene-light-3" />
        </g>
      )}
      {star && (
        <polygon
          points="0,-71 2.6,-65 9,-64.5 4,-60.5 5.6,-54 0,-57.5 -5.6,-54 -4,-60.5 -9,-64.5 -2.6,-65"
          fill="#facc15"
          className="scene-star"
        />
      )}
    </g>
  );
}

function Snowman({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="-16" r="16" className="scene-snowman" />
      <circle cx="0" cy="-40" r="11.5" className="scene-snowman" />
      <circle cx="0" cy="-58" r="8.5" className="scene-snowman" />
      <rect x="-8" y="-49" width="16" height="4" rx="2" fill="#dc2626" />
      <rect x="4" y="-48" width="4" height="12" rx="2" fill="#b91c1c" />
      <circle cx="-3" cy="-60" r="1.2" fill="#1f2937" />
      <circle cx="3" cy="-60" r="1.2" fill="#1f2937" />
      <polygon points="0,-57.5 9,-56 0,-55" fill="#f97316" />
      <circle cx="0" cy="-38" r="1.3" fill="#1f2937" />
      <circle cx="0" cy="-32" r="1.3" fill="#1f2937" />
      <circle cx="0" cy="-20" r="1.3" fill="#1f2937" />
      <rect x="-9" y="-67" width="18" height="2.5" fill="#111827" />
      <rect x="-6" y="-79" width="12" height="13" fill="#111827" />
      <rect x="-6" y="-70" width="12" height="2.5" fill="#dc2626" />
      <line x1="-11" y1="-42" x2="-24" y2="-52" stroke="#5b3a1e" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="-42" x2="23" y2="-50" stroke="#5b3a1e" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Cabin({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="18" cy="-24" r="22" fill="#fde68a" opacity="0.22" />
      <rect x="44" y="-66" width="9" height="20" fill="#7c2d12" />
      <circle cx="50" cy="-74" r="4" className="scene-smoke" />
      <circle cx="56" cy="-84" r="5" className="scene-smoke" />
      <circle cx="52" cy="-96" r="6" className="scene-smoke" />
      <rect x="0" y="-40" width="72" height="40" fill="#92400e" />
      <rect x="0" y="-40" width="72" height="40" fill="url(#cabin-logs)" />
      <polygon points="-8,-38 36,-68 80,-38" fill="#451a03" />
      <polygon points="-9,-38 36,-70 81,-38 74,-38 36,-63 -2,-38" className="scene-snow" />
      <rect x="10" y="-30" width="17" height="15" fill="#fde68a" />
      <line x1="18.5" y1="-30" x2="18.5" y2="-15" stroke="#92400e" strokeWidth="1.5" />
      <line x1="10" y1="-22.5" x2="27" y2="-22.5" stroke="#92400e" strokeWidth="1.5" />
      <rect x="44" y="-28" width="15" height="28" fill="#451a03" />
      <circle cx="56" cy="-14" r="1.2" fill="#facc15" />
      <circle cx="51.5" cy="-21" r="4" fill="none" stroke="#16a34a" strokeWidth="2.2" />
      <circle cx="51.5" cy="-17.5" r="1.2" fill="#dc2626" />
    </g>
  );
}

/** Snowy hills, pine trees, a cabin and a snowman above the footer. */
export function WinterScene() {
  return (
    <div className="winter-scene" aria-hidden="true">
      <svg viewBox="0 0 1440 190" preserveAspectRatio="xMidYMax slice">
        <defs>
          <pattern id="cabin-logs" width="72" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="7.5" x2="72" y2="7.5" stroke="#7c2d12" strokeWidth="1" />
          </pattern>
        </defs>
        <path d="M0 128 C180 84 360 108 540 96 S880 70 1080 98 S1330 82 1440 100 V190 H0 Z" className="scene-far" />
        <Tree x={90} y={118} s={0.8} far />
        <Tree x={135} y={112} s={1} far />
        <Tree x={600} y={95} s={0.75} far />
        <Tree x={640} y={93} s={0.95} far />
        <Tree x={690} y={92} s={0.7} far />
        <Tree x={1150} y={96} s={0.85} far />
        <Tree x={1195} y={94} s={1.05} far />
        <Tree x={1380} y={102} s={0.8} far />
        <path d="M0 160 C220 126 480 150 720 138 S1160 118 1440 150 V190 H0 Z" className="scene-near" />
        <Tree x={60} y={158} s={1.5} lights />
        <Tree x={250} y={146} s={1.85} lights star />
        <Snowman x={430} y={148} />
        <Cabin x={940} y={134} />
        <Tree x={1090} y={130} s={1.35} lights />
        <Tree x={1300} y={142} s={1.7} lights star />
        <Tree x={1400} y={148} s={1.2} />
      </svg>
    </div>
  );
}
