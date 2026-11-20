import type { Channel } from "./types";
import { snapSettings } from "./types";

/** Minimal shape needed for ranking; candidates may carry extra fields. */
export interface Ranked {
  distance: number;
  priority: number;
  key: string;
}

/** Distance with the priority bias folded in, all in screen pixels. */
function score(candidate: Ranked) {
  return candidate.distance - candidate.priority;
}

/**
 * How far (as a multiple of the capture radius) a held target may drift before
 * it releases. Kept small so a target the pointer has clearly left lets go
 * promptly, while still absorbing sub-pixel jitter between close candidates.
 */
const STICKY = 1.2;

/**
 * Candidate selection shared by every snap kind.
 *
 * - Candidates farther than the capture radius (screen px) are discarded.
 * - A held candidate stays honoured while it is still inside the capture
 *   radius, so two near-coincident targets cannot flicker back and forth.
 * - A challenger must be meaningfully closer (55%) to take over.
 * - If the held key left the candidate set (its object moved away, became
 *   hidden or was toggled off) or left the radius it is dropped immediately —
 *   snapping never stays locked to a target the pointer has left.
 */
export function select<T extends Ranked>(
  candidates: T[],
  channel: Channel,
  radius = snapSettings.radius,
): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate.distance > radius) continue;
    const value = score(candidate);
    if (value < bestScore) {
      best = candidate;
      bestScore = value;
    }
  }
  const held =
    channel.key === undefined
      ? undefined
      : candidates.find(
          (c) => c.key === channel.key && c.distance <= radius * STICKY,
        );
  if (!held) return best;
  // Compare raw distances for the takeover test so priority bias cannot make
  // a locked target impossible to displace. The held target is only honoured
  // while it is still inside the capture radius, so a target the pointer has
  // left is dropped on the very next frame.
  if (best && best.key !== held.key && best.distance < held.distance * 0.55) {
    return best;
  }
  return held;
}

export function hold(channel: Channel, candidate?: Ranked) {
  channel.key = candidate?.key;
  channel.distance = candidate?.distance ?? Infinity;
}

export function release(session: {
  point: Channel;
  spacingX: Channel;
  spacingY: Channel;
}) {
  for (const channel of [session.point, session.spacingX, session.spacingY]) {
    hold(channel);
  }
}
