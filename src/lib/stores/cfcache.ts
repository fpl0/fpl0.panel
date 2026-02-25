/**
 * Cloudflare data cache — avoids redundant network calls when navigating between views.
 *
 * Cached results are served immediately on re-mount, with background refresh
 * when TTL has expired. This makes view transitions feel instant.
 */
import {
  fetchLastDeployment,
  fetchAnalytics,
} from "../commands";
import type { CfDeploymentInfo, CfAnalytics } from "../commands";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const DEPLOYMENT_TTL = 60_000;  // 1 min — same as poll interval
const ANALYTICS_TTL = 300_000;  // 5 min — analytics data doesn't change fast

let deploymentCache: CacheEntry<CfDeploymentInfo> | null = null;
let analyticsCache: Map<string, CacheEntry<CfAnalytics>> = new Map();

function analyticsKey(days: number, engagement: boolean): string {
  return `${days}-${engagement}`;
}

function isStale<T>(entry: CacheEntry<T> | null | undefined, ttl: number): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > ttl;
}

/**
 * Get cached deployment or fetch fresh. Returns cached data immediately
 * if available, and refreshes in background if stale.
 */
export async function getCachedDeployment(
  onUpdate: (d: CfDeploymentInfo) => void,
): Promise<CfDeploymentInfo | null> {
  // Serve from cache immediately
  if (deploymentCache) {
    onUpdate(deploymentCache.data);
  }

  // Refresh if stale
  if (isStale(deploymentCache, DEPLOYMENT_TTL)) {
    try {
      const data = await fetchLastDeployment();
      deploymentCache = { data, fetchedAt: Date.now() };
      onUpdate(data);
      return data;
    } catch {
      return deploymentCache?.data ?? null;
    }
  }

  return deploymentCache?.data ?? null;
}

/** Force-refresh deployment cache (used by poll interval). */
export async function refreshDeployment(): Promise<CfDeploymentInfo | null> {
  try {
    const data = await fetchLastDeployment();
    deploymentCache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    return deploymentCache?.data ?? null;
  }
}

/**
 * Get cached analytics or fetch fresh. Returns cached data immediately
 * if available for the given params, and refreshes in background if stale.
 */
export async function getCachedAnalytics(
  days: number,
  engagement: boolean,
  onUpdate: (a: CfAnalytics) => void,
): Promise<CfAnalytics | null> {
  const key = analyticsKey(days, engagement);
  const cached = analyticsCache.get(key);

  // Serve from cache immediately
  if (cached) {
    onUpdate(cached.data);
  }

  // Refresh if stale
  if (isStale(cached, ANALYTICS_TTL)) {
    try {
      const data = await fetchAnalytics(days, engagement);
      analyticsCache.set(key, { data, fetchedAt: Date.now() });
      onUpdate(data);
      return data;
    } catch {
      return cached?.data ?? null;
    }
  }

  return cached?.data ?? null;
}

/**
 * Force-fetch analytics (used when user switches period/metric).
 * Always hits the network, updates cache.
 */
export async function forceAnalytics(
  days: number,
  engagement: boolean,
): Promise<CfAnalytics> {
  const data = await fetchAnalytics(days, engagement);
  analyticsCache.set(analyticsKey(days, engagement), { data, fetchedAt: Date.now() });
  return data;
}
