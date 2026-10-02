import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

/**
 * Current conditions where the device is.
 *
 * Open-Meteo is used because it needs no API key and no account — there is no
 * secret to ship in the bundle or rotate later. Coordinates are rounded to two
 * decimal places (about a kilometre) before they leave the device: that is far
 * more precision than a weather lookup needs, and it keeps the request from
 * carrying the user's exact position.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
/** Weather moves slowly; the widget does not need to ask often. */
const REFRESH_MS = 15 * 60 * 1000;

export interface Weather {
  /** WMO weather interpretation code — see `weatherIcon`. */
  code: number;
  isDay: boolean;
  /** Degrees celsius, rounded. */
  temperature: number;
}

async function fetchWeather(signal: AbortSignal): Promise<Weather | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;

  // The last known fix avoids waking the GPS for something this coarse; a
  // fresh one is only requested when the device has nothing cached.
  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: REFRESH_MS })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  if (!position) return null;

  const latitude = position.coords.latitude.toFixed(2);
  const longitude = position.coords.longitude.toFixed(2);
  const url = `${ENDPOINT}?latitude=${latitude}&longitude=${longitude}&current=weather_code,is_day,temperature_2m`;

  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const body = await response.json();
  const current = body?.current;
  if (!current || typeof current.weather_code !== 'number') return null;

  return {
    code: current.weather_code,
    isDay: current.is_day === 1,
    temperature: Math.round(current.temperature_2m),
  };
}

/**
 * Keeps the current conditions up to date, refreshing on a timer and whenever
 * the app comes back to the foreground — a phone asleep overnight runs no
 * timers, so returning to it is when the reading is most likely to be stale.
 *
 * Returns null while loading, and stays null if location is refused or the
 * request fails. Callers are expected to fall back to something that needs no
 * network.
 */
export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    fetchWeather(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted && next) setWeather(next);
      })
      // Offline, permission refused, service down — the widget has a fallback.
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
      inFlight.current?.abort();
    };
  }, [refresh]);

  return weather;
}

/**
 * The glyph for a WMO weather code.
 *
 * The codes are grouped rather than mapped one to one: the icon set has no
 * separate drizzle or freezing-rain symbol, and at this size the distinction
 * would not read anyway.
 */
export function weatherIcon(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'sunny' : 'moon';
  if (code === 1 || code === 2) return isDay ? 'partly-sunny' : 'cloudy-night';
  if (code === 3 || code === 45 || code === 48) return 'cloudy';
  if (code >= 95) return 'thunderstorm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rainy';
}
