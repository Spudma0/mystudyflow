import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBaseTheme } from '../theme/useBaseTheme';
import { useNow } from '../lib/useNow';
import { useWeather, weatherIcon } from '../lib/useWeather';

const MINUTE = 60 * 1000;

/**
 * Where the sun is, by the clock alone.
 *
 * Used until the real conditions arrive, and for good if location is refused
 * or there is no network — the widget should never sit there with a blank
 * space where the icon goes.
 */
function skyIcon(hour: number): keyof typeof Ionicons.glyphMap {
  if (hour >= 7 && hour < 17) return 'sunny';
  if (hour >= 5 && hour < 20) return 'partly-sunny';
  return 'moon';
}

/** The time of day under the current weather where the device is. */
export function ClockWidget() {
  const t = useBaseTheme();
  const now = useNow(MINUTE);
  const weather = useWeather();

  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const icon = weather
    ? (weatherIcon(weather.code, weather.isDay) as keyof typeof Ionicons.glyphMap)
    : skyIcon(now.getHours());

  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={34} color={t.onTile} />
      <Text style={[styles.time, { color: t.onTile }]}>{time}</Text>
      {weather ? (
        <Text style={[styles.temperature, { color: t.onTileMuted }]}>{weather.temperature}°</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  time: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  temperature: { fontSize: 12, fontWeight: '700', marginTop: -2 },
});
