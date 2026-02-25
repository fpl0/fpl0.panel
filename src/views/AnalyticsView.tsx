/**
 * AnalyticsView — Cloudflare traffic dashboard.
 * SVG bar chart, KPI strip, and 2-column grids for paths, countries,
 * browsers, and status codes.
 * Toggleable between full traffic metrics and engagement-only (page views).
 */
import { createSignal, For, Show, onMount } from "solid-js";
import type { CfAnalytics } from "../lib/commands";
import { getCachedAnalytics, forceAnalytics } from "../lib/stores/cfcache";

type Period = 7 | 30;
type MetricMode = "engagement" | "full";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatBytes(b: number): string {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(1)} GB`;
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} MB`;
  if (b >= 1_000) return `${(b / 1_000).toFixed(1)} KB`;
  return `${b} B`;
}

function statusClass(code: number): string {
  if (code >= 500) return "analytics-status-5xx";
  if (code >= 400) return "analytics-status-4xx";
  if (code >= 300) return "analytics-status-3xx";
  return "analytics-status-2xx";
}

/** Format "2026-02-18" → "Feb 18" */
function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

/**
 * SVG bar chart — one bar per day.
 * Shows count labels above bars and date labels along the X axis.
 */
function BarChart(props: { data: { date: string; count: number }[] }) {
  const svgW = 600;
  const topPad = 16;   // space for count labels
  const chartH = 110;
  const bottomPad = 16; // space for date labels
  const svgH = topPad + chartH + bottomPad;
  const barGap = 2;

  return (
    <div class="analytics-chart-wrap">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        class="analytics-chart"
        role="img"
        aria-label="Daily traffic bar chart"
      >
        {/* Baseline */}
        <line
          x1="0" y1={topPad + chartH}
          x2={svgW} y2={topPad + chartH}
          class="analytics-chart-baseline"
        />

        <For each={props.data}>
          {(d, i) => {
            const n = props.data.length;
            const max = () => Math.max(...props.data.map((x) => x.count), 1);
            const barW = () => Math.max((svgW - barGap * (n - 1)) / n, 1);
            const barH = () => (d.count / max()) * (chartH - 4);
            const x = () => i() * (barW() + barGap);
            const barY = () => topPad + chartH - barH();

            const showCount = () => d.count > 0;

            // Date labels: first, last, and evenly spaced (skip last if too close to a step)
            const dateStep = n <= 7 ? 1 : n <= 14 ? 2 : 7;
            const showDate = () => {
              if (i() === 0 || i() % dateStep === 0) return true;
              if (i() === n - 1) return (n - 1) % dateStep >= 3;
              return false;
            };

            return (
              <g>
                <rect
                  x={x()}
                  y={barY()}
                  width={barW()}
                  height={barH()}
                  rx="1"
                  class="analytics-bar"
                >
                  <title>{`${formatShortDate(d.date)}: ${formatNumber(d.count)}`}</title>
                </rect>
                <Show when={showCount()}>
                  <text
                    x={x() + barW() / 2}
                    y={barY() - 3}
                    text-anchor="middle"
                    class="analytics-bar-label"
                  >
                    {formatCompact(d.count)}
                  </text>
                </Show>
                <Show when={showDate()}>
                  <text
                    x={x() + barW() / 2}
                    y={topPad + chartH + 12}
                    text-anchor="middle"
                    class="analytics-date-label"
                  >
                    {formatShortDate(d.date)}
                  </text>
                </Show>
              </g>
            );
          }}
        </For>
      </svg>
    </div>
  );
}

export function AnalyticsView() {
  const [analytics, setAnalytics] = createSignal<CfAnalytics | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [period, setPeriod] = createSignal<Period>(7);
  const [metric, setMetric] = createSignal<MetricMode>("engagement");

  // Guards against stale responses when filters are switched rapidly
  let requestGen = 0;

  // Initial load: serve cached data instantly, refresh if stale
  onMount(async () => {
    const gen = ++requestGen;
    const eng = metric() === "engagement";
    try {
      await getCachedAnalytics(period(), eng, (data) => {
        if (gen === requestGen) {
          setAnalytics(data);
          setLoading(false);
        }
      });
    } catch (e) {
      if (gen === requestGen) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === requestGen) setLoading(false);
    }
  });

  // User-triggered filter changes: always hit the network
  async function switchPeriod(p: Period) {
    const gen = ++requestGen;
    setPeriod(p);
    setLoading(true);
    setError(null);
    try {
      const data = await forceAnalytics(p, metric() === "engagement");
      if (gen === requestGen) setAnalytics(data);
    } catch (e) {
      if (gen === requestGen) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === requestGen) setLoading(false);
    }
  }

  async function switchMetric(m: MetricMode) {
    const gen = ++requestGen;
    setMetric(m);
    setLoading(true);
    setError(null);
    try {
      const data = await forceAnalytics(period(), m === "engagement");
      if (gen === requestGen) setAnalytics(data);
    } catch (e) {
      if (gen === requestGen) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === requestGen) setLoading(false);
    }
  }

  const metricLabel = () => (metric() === "engagement" ? "page views" : "requests");

  // Derived KPI values from daily_requests
  const totalBytes = (a: CfAnalytics) => a.daily_requests.reduce((s, d) => s + d.bytes, 0);
  const totalCachedBytes = (a: CfAnalytics) => a.daily_requests.reduce((s, d) => s + d.cached_bytes, 0);
  const totalThreats = (a: CfAnalytics) => a.daily_requests.reduce((s, d) => s + d.threats, 0);
  const cacheRatio = (a: CfAnalytics) => {
    const total = totalBytes(a);
    if (total === 0) return 0;
    return Math.round((totalCachedBytes(a) / total) * 100);
  };

  return (
    <div class="analytics-view">
      <h1>Analytics</h1>

      <Show when={error()}>
        <div class="analytics-error">
          <p>{error()}</p>
          <button class="btn" onClick={() => switchPeriod(period())}>
            Retry
          </button>
        </div>
      </Show>

      <Show when={loading() && !analytics()}>
        <div class="analytics-skeleton">
          <div class="analytics-skeleton-bar" />
          <div class="analytics-skeleton-rows">
            <div class="analytics-skeleton-row" />
            <div class="analytics-skeleton-row" />
            <div class="analytics-skeleton-row" />
          </div>
        </div>
      </Show>

      <Show when={analytics()}>
        {(a) => (
          <div class={`analytics-content ${loading() ? "analytics-loading" : ""}`}>
            {/* Header: controls + KPI strip */}
            <div class="analytics-header">
              <div class="analytics-controls">
                <div class="filter-group">
                  <button
                    class={`filter-chip ${metric() === "engagement" ? "active" : ""}`}
                    onClick={() => switchMetric("engagement")}
                  >
                    Engagement
                  </button>
                  <button
                    class={`filter-chip ${metric() === "full" ? "active" : ""}`}
                    onClick={() => switchMetric("full")}
                  >
                    All Traffic
                  </button>
                </div>
                <div class="filter-group">
                  <button
                    class={`filter-chip ${period() === 7 ? "active" : ""}`}
                    onClick={() => switchPeriod(7)}
                  >
                    7d
                  </button>
                  <button
                    class={`filter-chip ${period() === 30 ? "active" : ""}`}
                    onClick={() => switchPeriod(30)}
                  >
                    30d
                  </button>
                </div>
              </div>
              <div class="analytics-kpi-strip">
                <div class="analytics-kpi">
                  <span class="analytics-kpi-value">{formatNumber(a().total_requests)}</span>
                  <span class="analytics-kpi-label">{metricLabel()}</span>
                </div>
                <div class="analytics-kpi">
                  <span class="analytics-kpi-value">{formatBytes(totalBytes(a()))}</span>
                  <span class="analytics-kpi-label">bandwidth</span>
                </div>
                <div class="analytics-kpi">
                  <span class="analytics-kpi-value">{cacheRatio(a())}%</span>
                  <span class="analytics-kpi-label">cached</span>
                </div>
                <Show when={totalThreats(a()) > 0}>
                  <div class="analytics-kpi analytics-kpi-warn">
                    <span class="analytics-kpi-value">{formatNumber(totalThreats(a()))}</span>
                    <span class="analytics-kpi-label">threats</span>
                  </div>
                </Show>
              </div>
            </div>

            {/* Traffic chart */}
            <div class="analytics-section">
              <div class="analytics-section-label">
                {metric() === "engagement" ? "Page views" : "Traffic"} &middot; {period()}d
              </div>
              <BarChart data={a().daily_requests} />
            </div>

            {/* Row 1: Top Paths + Top Countries */}
            <div class="analytics-grid">
              <div class="analytics-section">
                <div class="analytics-section-label">
                  Top {metric() === "engagement" ? "Content" : "Paths"} &middot; last 24h
                </div>
                <Show
                  when={a().top_paths.length > 0}
                  fallback={<p class="analytics-empty">No data for this period.</p>}
                >
                  <ol class="analytics-ranked-list">
                    <For each={a().top_paths}>
                      {(p) => (
                        <li class="analytics-ranked-item">
                          <span class="analytics-path">
                            {p.path.replace(/^\/blog\//, "")}
                          </span>
                          <span class="analytics-count">{formatNumber(p.count)}</span>
                        </li>
                      )}
                    </For>
                  </ol>
                </Show>
              </div>

              <div class="analytics-section">
                <div class="analytics-section-label">Top Countries &middot; last 24h</div>
                <Show
                  when={a().top_countries.length > 0}
                  fallback={<p class="analytics-empty">No data for this period.</p>}
                >
                  <div class="analytics-country-list">
                    <For each={a().top_countries}>
                      {(c, i) => {
                        const pct = () => {
                          const total = a().top_countries.reduce((s, x) => s + x.count, 0) || 1;
                          const raw = (c.count / total) * 100;
                          if (raw >= 1) return `${Math.round(raw)}`;
                          if (raw >= 0.1) return raw.toFixed(1);
                          return "<0.1";
                        };
                        const maxCount = () => a().top_countries[0]?.count || 1;
                        const barWidth = () => Math.max(Math.round((c.count / maxCount()) * 100), 2);
                        return (
                          <div class="analytics-country-row">
                            <span class="analytics-country-rank">{i() + 1}.</span>
                            <span class="analytics-country-name">{c.country}</span>
                            <div class="analytics-country-bar-bg">
                              <div
                                class="analytics-country-bar"
                                style={{ width: `${barWidth()}%` }}
                              />
                            </div>
                            <span class="analytics-country-pct">{pct()}%</span>
                            <span class="analytics-country-count">{formatNumber(c.count)}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </div>

            {/* Row 2: Browsers + Status Codes */}
            <div class="analytics-grid">
              <div class="analytics-section">
                <div class="analytics-section-label">Browsers &middot; {period()}d</div>
                <Show
                  when={a().browsers.length > 0}
                  fallback={<p class="analytics-empty">No browser data.</p>}
                >
                  <div class="analytics-country-list">
                    <For each={a().browsers}>
                      {(b, i) => {
                        const total = () => a().browsers.reduce((s, x) => s + x.page_views, 0) || 1;
                        const pct = () => {
                          const raw = (b.page_views / total()) * 100;
                          if (raw >= 1) return `${Math.round(raw)}`;
                          if (raw >= 0.1) return raw.toFixed(1);
                          return "<0.1";
                        };
                        const maxCount = () => a().browsers[0]?.page_views || 1;
                        const barWidth = () => Math.max(Math.round((b.page_views / maxCount()) * 100), 2);
                        return (
                          <div class="analytics-country-row">
                            <span class="analytics-country-rank">{i() + 1}.</span>
                            <span class="analytics-country-name">{b.browser}</span>
                            <div class="analytics-country-bar-bg">
                              <div
                                class="analytics-country-bar"
                                style={{ width: `${barWidth()}%` }}
                              />
                            </div>
                            <span class="analytics-country-pct">{pct()}%</span>
                            <span class="analytics-country-count">{formatNumber(b.page_views)}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              <div class="analytics-section">
                <div class="analytics-section-label">Status Codes &middot; {period()}d</div>
                <Show
                  when={a().status_codes.length > 0}
                  fallback={<p class="analytics-empty">No status code data.</p>}
                >
                  <div class="analytics-status-list">
                    <For each={a().status_codes}>
                      {(s) => {
                        const total = () => a().status_codes.reduce((sum, x) => sum + x.count, 0) || 1;
                        const pct = () => {
                          const raw = (s.count / total()) * 100;
                          if (raw >= 1) return `${Math.round(raw)}`;
                          if (raw >= 0.1) return raw.toFixed(1);
                          return "<0.1";
                        };
                        const maxCount = () => a().status_codes[0]?.count || 1;
                        const barWidth = () => Math.max(Math.round((s.count / maxCount()) * 100), 2);
                        return (
                          <div class="analytics-status-row">
                            <span class={`analytics-status-badge ${statusClass(s.status)}`}>
                              {s.status}
                            </span>
                            <div class="analytics-country-bar-bg">
                              <div
                                class={`analytics-country-bar ${statusClass(s.status)}-bar`}
                                style={{ width: `${barWidth()}%` }}
                              />
                            </div>
                            <span class="analytics-country-pct">{pct()}%</span>
                            <span class="analytics-country-count">{formatNumber(s.count)}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
