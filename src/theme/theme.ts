export const colors = {
  background: '#0A0A0F',
  backgroundElevated: '#12121A',
  card: '#15151F',
  cardAlt: '#1A1A26',
  border: '#232330',
  textPrimary: '#F5F5F7',
  textSecondary: '#9B9BAE',
  textMuted: '#6B6B7D',
  purple: '#8B5CF6',
  purpleLight: '#A78BFA',
  purpleDark: '#6D28D9',
  gradientStart: '#A78BFA',
  gradientEnd: '#7C3AED',
  danger: '#EF4444',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  amber: '#F59E0B',
  amberBg: 'rgba(245, 158, 11, 0.12)',
  rose: '#EC4899',
  roseBg: 'rgba(236, 72, 153, 0.14)',
  teal: '#14B8A6',
  tealBg: 'rgba(20, 184, 166, 0.14)',
  green: '#22C55E',
} as const;

/** Matches App.tsx's web phone-frame width, so full-screen overlays (modals,
 * sheets) stay confined to the app's viewport on web instead of spanning the
 * whole browser window. Harmless on native, where the device is never wider. */
export const APP_MAX_WIDTH = 430;

export const classColors = [
  '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E',
  '#14B8A6', '#3B82F6', '#EF4444', '#A855F7',
  '#F97316', '#06B6D4', '#84CC16', '#E11D48',
];

export const radii = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

export const typography = {
  greeting: { fontSize: 30, fontWeight: '800' as const, color: colors.textPrimary },
  screenTitle: { fontSize: 30, fontWeight: '800' as const, color: colors.textPrimary },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' as const, color: colors.textPrimary },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
};

export const shadow = {
  glow: {
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
};
