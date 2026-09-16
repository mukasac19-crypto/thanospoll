import { STONES } from "@/lib/stones";

/**
 * The landing page's one piece of art: the six stones as a slowly turning ring,
 * assembling on load and snapping on a loop.
 *
 * Inline SVG and CSS rather than canvas, because this needs to render in the
 * server component with no JavaScript at all — the hero should be complete
 * before hydration, not after. It is decorative, so it is hidden from
 * assistive tech entirely; every word it conveys is already in the headline.
 */

const CENTER = 160;
const ORBIT = 104;
const STONE_R = 13;

function position(index: number, total: number) {
  // Start at twelve o'clock so the ring reads as deliberate rather than tilted.
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * ORBIT,
    y: CENTER + Math.sin(angle) * ORBIT,
  };
}

export function GauntletHero({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 320"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <filter id="stone-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="core-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <radialGradient id="core">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rings leaving the centre, staggered so one is always in flight. */}
      {[0, 1.7, 3.4].map((delay, i) => (
        <circle
          key={i}
          className="snap-ring"
          cx={CENTER}
          cy={CENTER}
          r={70}
          fill="none"
          stroke="var(--color-power)"
          strokeWidth={1.25}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}

      {/* The core the stones are arranged around. */}
      <circle
        className="core-glow"
        cx={CENTER}
        cy={CENTER}
        r={54}
        fill="url(#core)"
        filter="url(#core-blur)"
      />

      <g className="orbit" style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}>
        {/* Faint track, so the ring reads as a structure and not six loose dots. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={ORBIT}
          fill="none"
          stroke="var(--color-edge)"
          strokeWidth={1}
          strokeDasharray="2 7"
          opacity={0.7}
        />

        {STONES.map((stone, i) => {
          const { x, y } = position(i, STONES.length);
          // Each stone lands a beat after the last, so it assembles.
          const delay = `${i * 0.13}s`;
          return (
            <g key={stone.id} className="stone-in" style={{ animationDelay: delay }}>
              <circle
                cx={x}
                cy={y}
                r={STONE_R + 7}
                fill={stone.color}
                opacity={0.55}
                filter="url(#stone-glow)"
              />
              <circle cx={x} cy={y} r={STONE_R} fill={stone.color} />
              {/* Offset highlight so each stone reads as a gem, not a dot. */}
              <circle
                cx={x - 4}
                cy={y - 4.5}
                r={4}
                fill="#fff"
                opacity={0.55}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
