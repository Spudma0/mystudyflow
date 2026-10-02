import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const COLORS = ['#EC4899', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];
const COUNT = 40;

function Piece({ index }: { index: number }) {
  const { width, height } = Dimensions.get('window');
  const startX = Math.random() * width;
  const drift = (Math.random() - 0.5) * 120;
  const size = 6 + Math.random() * 8;
  const color = COLORS[index % COLORS.length];
  const duration = 2200 + Math.random() * 1400;
  const delay = Math.random() * 400;

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, duration, delay]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${360 + Math.random() * 720}deg`],
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: 0,
        width: size,
        height: size * 1.6,
        borderRadius: 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

/** A brief falling-confetti burst. Mount it to play once. */
export function Confetti() {
  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: COUNT }, (_, i) => (
        <Piece key={i} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
