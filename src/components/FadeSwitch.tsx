import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

/**
 * Dissolves between two completely different screen trees.
 *
 * Signing in swaps the auth flow for the tab navigator — two unrelated trees, so
 * there is no navigator transition to lean on and the change lands as a hard cut.
 * This holds the outgoing tree on screen, fades it out, swaps underneath, then
 * fades the new one in: the app appears to settle into place instead of snapping.
 */
export function FadeSwitch({
  /** Changing this triggers the dissolve. */
  switchKey,
  children,
}: {
  switchKey: string;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  // What's actually on screen — lags `children` until the fade-out finishes.
  const [shown, setShown] = useState({ key: switchKey, node: children });

  useEffect(() => {
    if (switchKey === shown.key) {
      // Same tree, new content (a re-render) — pass it through without animating.
      setShown({ key: switchKey, node: children });
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setShown({ key: switchKey, node: children });
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    // `children` is deliberately not a dependency: the swap is driven by the key,
    // and re-running on every render would restart the fade mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchKey]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{shown.node}</Animated.View>
  );
}
