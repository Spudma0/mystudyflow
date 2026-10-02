import { useEffect, useState } from 'react';

/**
 * The current time, re-read on a fixed interval.
 *
 * The first tick is aligned to the next whole interval so a minute clock flips
 * when the minute actually changes rather than up to 59 seconds late.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const align = intervalMs - (Date.now() % intervalMs);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), intervalMs);
    }, align);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
