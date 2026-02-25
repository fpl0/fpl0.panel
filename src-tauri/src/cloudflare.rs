//! Cloudflare API integration — Pages deployments and GraphQL analytics.
//!
//! All functions accept a shared `&reqwest::Client` to reuse connections.

use crate::types::{CfAnalytics, CfCountryCount, CfDailyCount, CfDeploymentInfo, CfPathCount};

/// Look up the zone ID for a domain via the Cloudflare Zones API.
pub async fn fetch_zone_id(
    client: &reqwest::Client,
    api_token: &str,
    domain: &str,
) -> Result<String, String> {
    let resp: serde_json::Value = client
        .get(format!(
            "https://api.cloudflare.com/client/v4/zones?name={domain}"
        ))
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch zones: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse zones response: {e}"))?;

    let id = resp["result"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|z| z["id"].as_str())
        .ok_or_else(|| format!("No zone found for domain '{domain}'"))?;

    Ok(id.to_string())
}

/// Fetch the last successful production deployment from Cloudflare Pages.
pub async fn fetch_last_deployment(
    client: &reqwest::Client,
    account_id: &str,
    project_name: &str,
    api_token: &str,
) -> Result<CfDeploymentInfo, String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/{project_name}/deployments?env=production&per_page=5"
    );
    let resp: serde_json::Value = client
        .get(&url)
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch deployments: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse deployments response: {e}"))?;

    let deployments = resp["result"]
        .as_array()
        .ok_or("Unexpected deployments response format")?;

    for dep in deployments {
        let latest_stage = &dep["latest_stage"];
        let stage_name = latest_stage["name"].as_str().unwrap_or_default();
        let stage_status = latest_stage["status"].as_str().unwrap_or_default();

        if stage_name == "deploy" && stage_status == "success" {
            let deployed_at = latest_stage["ended_on"]
                .as_str()
                .or_else(|| dep["created_on"].as_str())
                .unwrap_or_default()
                .to_string();

            let trigger = &dep["deployment_trigger"]["metadata"];
            let commit_hash = trigger["commit_hash"].as_str().map(String::from);
            let commit_message = trigger["commit_message"].as_str().map(String::from);
            let url = dep["url"].as_str().map(String::from);

            return Ok(CfDeploymentInfo {
                deployed_at,
                commit_hash,
                commit_message,
                status: "success".to_string(),
                url,
            });
        }
    }

    Err("No successful production deployment found".to_string())
}

/// Whether a path looks like a real content page (blog, app, about, tags, home).
fn is_content_path(path: &str) -> bool {
    if path == "/" {
        return true;
    }
    let p = path.trim_end_matches('/');
    p.starts_with("/blog/")
        || p.starts_with("/apps/")
        || p.starts_with("/about")
        || p.starts_with("/tags")
}

/// Fetch traffic analytics from Cloudflare's GraphQL Analytics API.
///
/// Uses `httpRequests1dGroups` for daily totals (supports wide time ranges)
/// and `httpRequestsAdaptiveGroups` for path/country breakdowns (last 24h only,
/// since free zones cap adaptive queries at 86400s).
///
/// When `engagement` is true, daily counts use `pageViews` instead of `requests`
/// and paths are filtered to content pages only (blog, apps, about, tags).
pub async fn fetch_analytics(
    client: &reqwest::Client,
    api_token: &str,
    zone_id: &str,
    days: u32,
    engagement: bool,
) -> Result<CfAnalytics, String> {
    let now = chrono::Utc::now();
    // days-1 so that "7d" = today + 6 prior days = 7 bars exactly
    let start = now - chrono::Duration::days((days - 1) as i64);
    let start_date = start.format("%Y-%m-%d").to_string();
    let end_date = now.format("%Y-%m-%d").to_string();

    // Adaptive queries: last 24h only (free-zone safe)
    let adaptive_start = (now - chrono::Duration::days(1))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let adaptive_end = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();

    // Engagement uses pageViews; full uses requests
    let daily_metric = if engagement { "pageViews" } else { "requests" };

    // Fetch more paths when filtering to engagement so we have enough after filtering
    let path_limit = if engagement { 50 } else { 10 };

    // Engagement: only count successful responses (filters bot probes returning 404/403)
    let adaptive_extra = if engagement {
        ", edgeResponseStatus: 200"
    } else {
        ""
    };

    let query = format!(
        r#"{{
  viewer {{
    zones(filter: {{ zoneTag: "{zone_id}" }}) {{
      daily: httpRequests1dGroups(
        filter: {{ date_geq: "{start_date}", date_leq: "{end_date}" }}
        limit: 1000
        orderBy: [date_ASC]
      ) {{
        dimensions {{ date }}
        sum {{ {daily_metric} }}
      }}
      topPaths: httpRequestsAdaptiveGroups(
        filter: {{ datetime_geq: "{adaptive_start}", datetime_leq: "{adaptive_end}"{adaptive_extra} }}
        limit: {path_limit}
        orderBy: [count_DESC]
      ) {{
        count
        dimensions {{ clientRequestPath }}
      }}
      topCountries: httpRequestsAdaptiveGroups(
        filter: {{ datetime_geq: "{adaptive_start}", datetime_leq: "{adaptive_end}"{adaptive_extra} }}
        limit: 10
        orderBy: [count_DESC]
      ) {{
        count
        dimensions {{ clientCountryName }}
      }}
    }}
  }}
}}"#
    );

    let resp: serde_json::Value = client
        .post("https://api.cloudflare.com/client/v4/graphql")
        .bearer_auth(api_token)
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch analytics: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse analytics response: {e}"))?;

    // Check for GraphQL errors
    if let Some(errors) = resp["errors"].as_array() {
        if !errors.is_empty() {
            let msg = errors[0]["message"]
                .as_str()
                .unwrap_or("Unknown GraphQL error");
            return Err(format!("Analytics query failed: {msg}"));
        }
    }

    let zones = &resp["data"]["viewer"]["zones"];
    let zone = zones
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("No zone data returned")?;

    // Parse daily counts from httpRequests1dGroups
    let mut daily_map: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    if let Some(daily_arr) = zone["daily"].as_array() {
        for entry in daily_arr {
            let date = entry["dimensions"]["date"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let count = entry["sum"][daily_metric].as_u64().unwrap_or(0);
            *daily_map.entry(date).or_default() += count;
        }
    }
    // Build a contiguous series so every day in the range has an entry (0 if missing)
    let daily_requests: Vec<CfDailyCount> = (0..days)
        .map(|i| {
            let date = (start + chrono::Duration::days(i as i64))
                .format("%Y-%m-%d")
                .to_string();
            let count = daily_map.get(&date).copied().unwrap_or(0);
            CfDailyCount { date, count }
        })
        .collect();

    let total_requests: u64 = daily_requests.iter().map(|d| d.count).sum();

    // Parse top paths from adaptive groups (last 24h)
    let mut path_map: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    if let Some(paths_arr) = zone["topPaths"].as_array() {
        for entry in paths_arr {
            let path = entry["dimensions"]["clientRequestPath"]
                .as_str()
                .unwrap_or("/")
                .to_string();
            // In engagement mode, skip non-content paths
            if engagement && !is_content_path(&path) {
                continue;
            }
            let count = entry["count"].as_u64().unwrap_or(0);
            *path_map.entry(path).or_default() += count;
        }
    }
    let mut top_paths: Vec<CfPathCount> = path_map
        .into_iter()
        .map(|(path, count)| CfPathCount { path, count })
        .collect();
    top_paths.sort_by(|a, b| b.count.cmp(&a.count));
    top_paths.truncate(10);

    // Parse top countries from adaptive groups (last 24h)
    let mut country_map: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    if let Some(countries_arr) = zone["topCountries"].as_array() {
        for entry in countries_arr {
            let country = entry["dimensions"]["clientCountryName"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string();
            let count = entry["count"].as_u64().unwrap_or(0);
            *country_map.entry(country).or_default() += count;
        }
    }
    let mut top_countries: Vec<CfCountryCount> = country_map
        .into_iter()
        .map(|(country, count)| CfCountryCount { country, count })
        .collect();
    top_countries.sort_by(|a, b| b.count.cmp(&a.count));
    top_countries.truncate(10);

    Ok(CfAnalytics {
        period: format!("{days}d"),
        total_requests,
        daily_requests,
        top_paths,
        top_countries,
    })
}
