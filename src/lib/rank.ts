import { StudySession } from '../types';

/**
 * Subject ranking.
 *
 * XP is *derived* from the study sessions already stored for a subject rather
 * than being a separate counter — so ranks are correct retroactively, survive a
 * reinstall with the rest of the synced data, and can never drift out of step
 * with the study history they're supposed to describe.
 */

export interface Rank {
  name: string;
  /** Badge gradient, light end first. */
  colors: [string, string];
  /** Colour for the rank text and the XP bar fill. */
  accent: string;
}

export const RANKS: Rank[] = [
  { name: 'Wood', colors: ['#A97B4F', '#5C3A21'], accent: '#B98A5E' },
  { name: 'Silver', colors: ['#D8E0EA', '#8A97A8'], accent: '#C3CCD9' },
  { name: 'Gold', colors: ['#F7D46B', '#C08A17'], accent: '#F0C040' },
  { name: 'Platinum', colors: ['#B6EFE8', '#4FB3A9'], accent: '#7FDDD2' },
  { name: 'Diamond', colors: ['#A5DEFF', '#3B82F6'], accent: '#79C6F5' },
  { name: 'Emerald', colors: ['#7FF0B4', '#0E9F6E'], accent: '#4BDC94' },
  { name: 'Master', colors: ['#D3AEFF', '#7C3AED'], accent: '#B48CF5' },
  { name: 'Grandmaster', colors: ['#FFA3A3', '#DC2626'], accent: '#FF7A7A' },
];

export const TIERS_PER_RANK = 3;
export const TIER_LABELS = ['I', 'II', 'III'];
const TOTAL_TIERS = RANKS.length * TIERS_PER_RANK; // 24

// Each tier costs a little more than the last. ~100 XP for the first (about an
// hour and a half of study) rising to ~2.8k for the final Grandmaster tier.
const BASE_TIER_XP = 100;
const TIER_GROWTH = 1.16;

/** XP needed to clear the tier at `level` (0-indexed across all ranks). */
export function tierCost(level: number): number {
  return Math.round(BASE_TIER_XP * Math.pow(TIER_GROWTH, level));
}

/**
 * XP earned by one session: a point a minute, plus a focus bonus of 10 for each
 * completed half hour — so a single long sitting beats the same total broken up.
 */
export function xpForSession(durationSec: number): number {
  const minutes = Math.max(0, durationSec) / 60;
  return Math.round(minutes) + Math.floor(minutes / 30) * 10;
}

export function xpForSessions(sessions: StudySession[]): number {
  return sessions.reduce((sum, s) => sum + xpForSession(s.durationSec), 0);
}

/**
 * XP for finishing a lesson: its planned minutes, plus a bonus for seeing it
 * through.
 *
 * The minutes match what the same time logged as a study session would earn,
 * so neither route is the cheap one. The bonus is there because a lesson ends
 * in twelve questions — it is studied *and* tested, which a timer alone never
 * is.
 */
export const LESSON_COMPLETION_BONUS = 20;

/**
 * What a perfect run of a lesson is worth.
 */
export function maxXpForLesson(durationMin: number): number {
  return Math.max(0, Math.round(durationMin)) + LESSON_COMPLETION_BONUS;
}

/**
 * The share of a lesson's XP that finishing it earns regardless of the score.
 *
 * Not zero: working through a hard lesson and getting half of it wrong is
 * still the study that teaches you it, and paying nothing for that would make
 * the safe move be to avoid anything difficult.
 */
const EFFORT_SHARE = 0.4;

/** XP for a finished lesson, scaled by how much of it was answered correctly. */
export function xpForLesson(durationMin: number, accuracy = 1): number {
  const share = EFFORT_SHARE + (1 - EFFORT_SHARE) * Math.max(0, Math.min(1, accuracy));
  return Math.round(maxXpForLesson(durationMin) * share);
}

/**
 * XP from every lesson a subject has finished.
 *
 * Derived from the completed ids and the plan itself, like session XP is
 * derived from the sessions: nothing to keep in step, correct retroactively,
 * and it cannot drift. A rebuilt plan clears completions, so this falls back
 * to zero with them rather than leaving XP behind for work that is now gone.
 */
export function xpForCompletedLessons(profile?: {
  lessonMap: { lessons: { id: string; durationMin: number }[] } | null;
  completedLessonIds: string[];
  lessonScores?: Record<string, number>;
}): number {
  const lessons = profile?.lessonMap?.lessons;
  if (!lessons?.length || !profile?.completedLessonIds?.length) return 0;
  const done = new Set(profile.completedLessonIds);
  const scores = profile.lessonScores ?? {};
  return lessons
    .filter((lesson) => done.has(lesson.id))
    .reduce((sum, lesson) => sum + xpForLesson(lesson.durationMin, scores[lesson.id] ?? 1), 0);
}

export interface RankProgress {
  rank: Rank;
  rankIndex: number;
  /** 1-based tier within the rank. */
  tier: number;
  /** e.g. "Gold II" — or just "Grandmaster III" at the cap. */
  label: string;
  totalXp: number;
  /** XP earned inside the current tier, and what the tier costs. */
  xpIntoTier: number;
  tierXp: number;
  /** 0–1 through the current tier; 1 when maxed out. */
  progress: number;
  xpToNext: number;
  isMax: boolean;
}

export function rankFromXp(totalXp: number): RankProgress {
  let remaining = Math.max(0, totalXp);
  let level = 0;
  while (level < TOTAL_TIERS - 1 && remaining >= tierCost(level)) {
    remaining -= tierCost(level);
    level += 1;
  }

  const rankIndex = Math.floor(level / TIERS_PER_RANK);
  const tierIndex = level % TIERS_PER_RANK;
  const rank = RANKS[rankIndex];
  const tierXp = tierCost(level);
  const isMax = level === TOTAL_TIERS - 1 && remaining >= tierXp;

  return {
    rank,
    rankIndex,
    tier: tierIndex + 1,
    label: `${rank.name} ${TIER_LABELS[tierIndex]}`,
    totalXp: Math.max(0, totalXp),
    xpIntoTier: isMax ? tierXp : remaining,
    tierXp,
    progress: isMax ? 1 : Math.min(1, remaining / tierXp),
    xpToNext: isMax ? 0 : tierXp - remaining,
    isMax,
  };
}
