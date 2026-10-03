import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { radii, spacing } from '../theme/theme';
import { useBaseTheme } from '../theme/useBaseTheme';

/**
 * A skeletal structure, drawn from SMILES.
 *
 * The drawing is done on the server and arrives as SVG, so there is no
 * chemistry engine or WebView in the app — just an SVG to render. A molecule's
 * drawing never changes, so the server caches it hard and this only ever
 * fetches a given structure once.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/** Kept for the life of the app: the same SMILES always draws the same way. */
const memory = new Map<string, string>();

export function StructureDiagram({ smiles, caption }: { smiles: string; caption?: string }) {
  const t = useBaseTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [svg, setSvg] = React.useState<string | null>(() => memory.get(smiles) ?? null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (memory.has(smiles)) {
      setSvg(memory.get(smiles)!);
      return;
    }

    let live = true;
    const controller = new AbortController();

    fetch(`${API_URL}/api/chem/structure?smiles=${encodeURIComponent(smiles)}&theme=dark`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((markup) => {
        memory.set(smiles, markup);
        if (live) setSvg(markup);
      })
      // A structure that will not draw is a missing diagram, not a broken
      // lesson — the caption still says what the molecule is.
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
      controller.abort();
    };
  }, [smiles]);

  // The drawing carries its own pixel size; it is scaled down to fit a narrow
  // screen but never blown up past its natural size, where bonds go soft.
  const natural = svg ? readSize(svg) : null;
  const available = Math.min(screenWidth - spacing.xl * 4, 520);
  const scale = natural ? Math.min(1, available / natural.width) : 1;

  if (failed) return null;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      {svg && natural ? (
        <SvgXml xml={svg} width={natural.width * scale} height={natural.height * scale} />
      ) : (
        <View style={[styles.loading, { height: 120 }]}>
          <ActivityIndicator color={t.accentLight} />
        </View>
      )}
      {!!caption && (
        <Text style={[styles.caption, { color: t.onCardSecondary }]}>{caption}</Text>
      )}
    </View>
  );
}

/** Pulls the width and height the server set on the drawing. */
function readSize(markup: string): { width: number; height: number } | null {
  const width = Number(markup.match(/width="(\d+(?:\.\d+)?)"/)?.[1]);
  const height = Number(markup.match(/height="(\d+(?:\.\d+)?)"/)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loading: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12.5, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
});
