import {
  useThemeStore,
  isLightColor,
  contrastText,
  lighten,
  darken,
  mix,
  withAlpha,
} from '../store/useThemeStore';

/**
 * App-wide theme derived from the two user-picked colours:
 *  - baseColor   → the app background (bottom-right of the home tile gradient)
 *  - accentColor → the highlight/accent colour (top-left of the tile gradient)
 * Plus contrast-aware colours for text/icons on each surface.
 */
export function useBaseTheme() {
  const tileBase = useThemeStore((s) => s.baseColor);
  const accent = useThemeStore((s) => s.accentColor);
  const linkBackground = useThemeStore((s) => s.linkBackground);
  const bgColor = useThemeStore((s) => s.bgColor);
  const cardColor = useThemeStore((s) => s.cardColor);
  // App background follows the tile's bottom-right colour unless the user
  // has unlinked it and chosen an independent background.
  const base = linkBackground ? tileBase : bgColor;
  const isLight = isLightColor(base);
  const cardIsLight = isLightColor(cardColor);

  return {
    // --- Base background + text on it ---
    base,
    isLight,
    /** Primary text directly on the base background */
    text: isLight ? '#1A1A24' : '#F5F5F7',
    /** Secondary text directly on the base background */
    secondary: isLight ? '#44444E' : '#9B9BAE',
    /** Muted labels directly on the base background */
    muted: isLight ? '#5B5B66' : '#6B6B7D',

    // --- Accent ---
    accent,
    accentLight: lighten(accent, 0.28),
    accentDark: darken(accent, 0.28),
    /** Text/icon colour that reads on an accent-filled surface */
    onAccent: contrastText(accent),
    /** Translucent accent fill for pills/soft backgrounds */
    accentSoftBg: withAlpha(accent, 0.16),

    // --- Card / button surfaces (user-chosen) + contrast-aware content ---
    card: cardColor,
    cardIsLight,
    cardAlt: cardIsLight ? darken(cardColor, 0.06) : lighten(cardColor, 0.05),
    cardBorder: cardIsLight ? darken(cardColor, 0.12) : lighten(cardColor, 0.1),
    /** Translucent card colour — for surfaces that float over the tile gradient. */
    cardScrim: withAlpha(cardColor, 0.5),
    /** Primary text/icons on a card surface */
    onCard: cardIsLight ? '#1A1A24' : '#F5F5F7',
    /** Secondary text on a card surface */
    onCardSecondary: cardIsLight ? '#44444E' : '#9B9BAE',
    /** Muted text on a card surface */
    onCardMuted: cardIsLight ? '#5B5B66' : '#6B6B7D',

    // --- Home tile gradient (accent top-left → tile base bottom-right) ---
    tileGradient: [accent, mix(accent, tileBase, 0.5), tileBase] as [string, string, string],
    /** Visible tile edge — a darker shade of the accent (top-left) colour. */
    tileBorder: darken(accent, 0.34),
    /** Text/icons sitting on the tile (top area is accent-heavy) */
    onTile: contrastText(accent),
    /** Scrim for the stat cards floating on the tile */
    tileScrim: isLightColor(accent) ? 'rgba(255,255,255,0.5)' : 'rgba(10, 8, 18, 0.55)',
    /** Muted text on the tile */
    onTileMuted: isLightColor(accent) ? 'rgba(20,20,30,0.6)' : 'rgba(255,255,255,0.62)',
  };
}
