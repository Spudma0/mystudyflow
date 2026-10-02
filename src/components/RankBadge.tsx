import React from 'react';
import Svg, { Defs, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import { Rank, TIERS_PER_RANK } from '../lib/rank';

// Drawn in a 100 × 116 box and scaled by `size`, so every badge stays crisp.
const W = 100;
const H = 116;

/** Crest outline: squared shoulders, rounded corners, a wide rounded foot. */
const SHIELD =
  'M 12 8 Q 12 3 17 3 L 83 3 Q 88 3 88 8 L 88 64 Q 88 104 50 113 Q 12 104 12 64 Z';

/** The same crest inset, used as a highlight so the badge reads as embossed. */
const SHIELD_INNER =
  'M 22 16 Q 22 12 26 12 L 74 12 Q 78 12 78 16 L 78 62 Q 78 92 50 100 Q 22 92 22 62 Z';

function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

/**
 * The rank crest. The gradient and the chevron count come from the rank itself,
 * and the filled stars along the foot show which of the three tiers you're on.
 */
export function RankBadge({
  rank,
  tier,
  size = 56,
}: {
  rank: Rank;
  /** 1-based tier within the rank. */
  tier: number;
  size?: number;
}) {
  const height = (size * H) / W;
  const id = `rank-${rank.name}`;

  // Star row along the foot of the crest.
  const starY = 78;
  const starGap = 17;
  const starX = 50 - ((TIERS_PER_RANK - 1) * starGap) / 2;

  return (
    <Svg width={size} height={height} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={rank.colors[0]} />
          <Stop offset="1" stopColor={rank.colors[1]} />
        </LinearGradient>
        <LinearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.04" />
        </LinearGradient>
      </Defs>

      <Path d={SHIELD} fill={`url(#${id})`} stroke={rank.colors[1]} strokeWidth={3} strokeLinejoin="round" />
      <Path d={SHIELD_INNER} fill={`url(#${id}-sheen)`} />

      {/* Chevrons — one more for each rank up the ladder, so the crest itself
          says how far you've come before you read the label. */}
      {Array.from({ length: 3 }, (_, i) => {
        const y = 34 + i * 11;
        return (
          <Path
            key={i}
            d={`M 34 ${y} L 50 ${y + 10} L 66 ${y}`}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={i === 0 ? 0.95 : i === 1 ? 0.6 : 0.32}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {Array.from({ length: TIERS_PER_RANK }, (_, i) => (
        <Polygon
          key={i}
          points={starPoints(starX + i * starGap, starY, 6.5)}
          fill="#FFFFFF"
          fillOpacity={i < tier ? 0.95 : 0.22}
        />
      ))}
    </Svg>
  );
}
