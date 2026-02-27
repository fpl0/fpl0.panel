import { createSignal } from "solid-js";
import { checkUrlHealth, DEV_SERVER_ORIGIN } from "../commands";
import type { HealthStatus } from "../commands";

const HEALTH_TTL = 300_000; // 5 minutes

const [devHealth, setDevHealth] = createSignal<HealthStatus | null>(null);
const [prodHealth, setProdHealth] = createSignal<HealthStatus | null>(null);

let intervalId: ReturnType<typeof setInterval> | null = null;

async function pollHealth() {
  checkUrlHealth(DEV_SERVER_ORIGIN)
    .then((h) => setDevHealth(h))
    .catch(() => {});
  checkUrlHealth("https://fpl0.io")
    .then((h) => setProdHealth(h))
    .catch(() => {});
}

/** Start global health polling — call once from initApp(). */
export function startHealthPolling() {
  // Immediate first check
  pollHealth();
  // Then every 5 minutes
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(pollHealth, HEALTH_TTL);
}

/** Trigger an immediate re-poll (e.g. after starting the dev server). */
export function recheckHealth() {
  pollHealth();
}

export { devHealth, prodHealth };
