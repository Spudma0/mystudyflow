import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Lazily-created players for the two chimes. Wrapped in try/catch so the web
// preview (and any platform without audio) degrades gracefully instead of crashing.
let breakPlayer: AudioPlayer | null = null;
let donePlayer: AudioPlayer | null = null;
let ready = false;

async function ensureReady() {
  if (ready) return;
  ready = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {}
  try {
    breakPlayer = createAudioPlayer(require('../../assets/sounds/break-chime.wav'));
    donePlayer = createAudioPlayer(require('../../assets/sounds/session-complete.wav'));
  } catch {}
}

function replay(player: AudioPlayer | null) {
  if (!player) return;
  try {
    player.seekTo(0);
    player.play();
  } catch {}
}

/** Gentle chime + medium haptic — used when a break starts. */
export async function signalBreak() {
  await ensureReady();
  replay(breakPlayer);
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

/** Triumphant chime + success haptic — used when the whole session completes. */
export async function signalComplete() {
  await ensureReady();
  replay(donePlayer);
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

/** Light haptic tick — used for small transitions (e.g. break ending). */
export async function lightTick() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}
