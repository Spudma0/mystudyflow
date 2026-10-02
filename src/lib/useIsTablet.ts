import { useWindowDimensions } from 'react-native';

/**
 * The width at which the layout stops being a phone layout.
 *
 * 768 is the short edge of the smallest iPad, so every iPad is above it in
 * either orientation while no phone reaches it. Measured rather than asked of
 * the device, so a split-screen iPad running at phone width correctly gets the
 * phone layout.
 */
export const TABLET_MIN_WIDTH = 768;

/** How wide the web preview's tablet frame gets before it stops growing. */
export const TABLET_MAX_WIDTH = 1180;

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_MIN_WIDTH;
}
