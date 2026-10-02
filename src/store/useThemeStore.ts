import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BaseColorOption {
  name: string;
  color: string;
}

export const BASE_COLOR_PALETTE: BaseColorOption[] = [
  { name: 'Black', color: '#0A0A0F' },
  { name: 'Navy', color: '#101A33' },
  { name: 'Snow', color: '#F4F4F6' },
  { name: 'Cream', color: '#F5EEDF' },
  { name: 'Sky', color: '#D9E9FA' },
  { name: 'Mint', color: '#DCF3E4' },
  { name: 'Lavender', color: '#E7DFF8' },
  { name: 'Blush', color: '#F9E1EA' },
];

/** Card / button surface colours (reminder cards, exam card, empty-state tiles…). */
export const CARD_COLOR_PALETTE: BaseColorOption[] = [
  { name: 'Charcoal', color: '#15151F' },
  { name: 'Slate', color: '#1C2230' },
  { name: 'Graphite', color: '#26262E' },
  { name: 'Plum', color: '#241A2E' },
  { name: 'Forest', color: '#16241E' },
  { name: 'Steel', color: '#2A3240' },
  { name: 'Cloud', color: '#EEF0F4' },
  { name: 'Sand', color: '#EDE6D6' },
];

/** Accent / highlight colours (the top-left of the home tile + app-wide accent). */
export const ACCENT_COLOR_PALETTE: BaseColorOption[] = [
  { name: 'Purple', color: '#8B5CF6' },
  { name: 'Indigo', color: '#6366F1' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Teal', color: '#14B8A6' },
  { name: 'Green', color: '#22C55E' },
  { name: 'Amber', color: '#F59E0B' },
  { name: 'Orange', color: '#F97316' },
  { name: 'Rose', color: '#EC4899' },
  { name: 'Red', color: '#EF4444' },
  { name: 'Cyan', color: '#06B6D4' },
];

// ---- Colour maths ---------------------------------------------------------

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const c = hex.replace('#', '');
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join('');
}

/** Linear blend between two hex colours. t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

export function lighten(hex: string, t: number): string {
  return mix(hex, '#FFFFFF', t);
}

export function darken(hex: string, t: number): string {
  return mix(hex, '#000000', t);
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance — treat > 0.5 as a light colour needing dark text. */
export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

/** A readable text colour (near-black or near-white) for text placed on `hex`. */
export function contrastText(hex: string): string {
  return isLightColor(hex) ? '#1A1A24' : '#F5F5F7';
}

interface ThemeState {
  /** Bottom-right colour of the home tile gradient. */
  baseColor: string;
  /** Accent / top-left colour. */
  accentColor: string;
  /** When true, the app background follows `baseColor` (tile bottom-right). */
  linkBackground: boolean;
  /** The app background colour used when `linkBackground` is false. */
  bgColor: string;
  /** Card / button surface colour. */
  cardColor: string;
  /** Draws the faint line pattern behind the app's screens. */
  lineGrid: boolean;
  setBaseColor: (color: string) => void;
  setAccentColor: (color: string) => void;
  setLinkBackground: (linked: boolean) => void;
  setBgColor: (color: string) => void;
  setCardColor: (color: string) => void;
  setLineGrid: (on: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      baseColor: BASE_COLOR_PALETTE[0].color,
      accentColor: ACCENT_COLOR_PALETTE[0].color,
      linkBackground: true,
      bgColor: BASE_COLOR_PALETTE[0].color,
      cardColor: CARD_COLOR_PALETTE[0].color,
      lineGrid: true,
      setBaseColor: (color) => set({ baseColor: color }),
      setAccentColor: (color) => set({ accentColor: color }),
      setLinkBackground: (linked) => set({ linkBackground: linked }),
      setBgColor: (color) => set({ bgColor: color }),
      setCardColor: (color) => set({ cardColor: color }),
      setLineGrid: (on) => set({ lineGrid: on }),
    }),
    {
      name: 'studyflow-theme',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
