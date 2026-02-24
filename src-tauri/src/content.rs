//! Content CRUD — listing, creating, and deleting blog posts and apps.

use std::fs;
use std::path::{Path, PathBuf};

use crate::frontmatter::{parse_content_entry, to_slug, today_iso};
use crate::git::git_add_commit_push;
use crate::security::escape_yaml_string;
use crate::types::{ContentEntry, CreateAppArgs, CreatePostArgs};

/// Scan the blog and apps content directories, returning all entries sorted by creation date.
pub fn list_content(repo_path: &str) -> Result<Vec<ContentEntry>, String> {
    let base = Path::new(repo_path);
    let blog_dir = base.join("src/content/blog");
    let apps_dir = base.join("src/content/apps");
    let mut entries: Vec<ContentEntry> = Vec::new();

    // Scan blog posts
    if blog_dir.is_dir() {
        if let Ok(readdir) = fs::read_dir(&blog_dir) {
            for entry in readdir.flatten() {
                if entry.path().is_dir() {
                    let slug = entry.file_name().to_string_lossy().to_string();
                    let mdx_path = entry.path().join("index.mdx");
                    let md_path = entry.path().join("index.md");
                    let file_path = if mdx_path.exists() {
                        mdx_path
                    } else if md_path.exists() {
                        md_path
                    } else {
                        continue;
                    };
                    if let Some(e) = parse_content_entry(&slug, "post", &file_path) {
                        entries.push(e);
                    }
                }
            }
        }
    }

    // Scan apps
    if apps_dir.is_dir() {
        if let Ok(readdir) = fs::read_dir(&apps_dir) {
            for entry in readdir.flatten() {
                if entry.path().is_dir() {
                    let slug = entry.file_name().to_string_lossy().to_string();
                    let md_path = entry.path().join("index.md");
                    if md_path.exists() {
                        if let Some(e) = parse_content_entry(&slug, "app", &md_path) {
                            entries.push(e);
                        }
                    }
                }
            }
        }
    }

    // Sort by created_date descending
    entries.sort_by(|a, b| b.created_date.cmp(&a.created_date));
    Ok(entries)
}

/// Create a new blog post directory with frontmatter scaffolding.
pub fn create_post(repo_path: &str, args: CreatePostArgs) -> Result<ContentEntry, String> {
    let slug = if args.slug.is_empty() {
        to_slug(&args.title)
    } else {
        args.slug
    };
    let post_dir = Path::new(repo_path)
        .join("src/content/blog")
        .join(&slug);

    if post_dir.exists() {
        return Err(format!("Post \"{}\" already exists.", slug));
    }

    fs::create_dir_all(&post_dir)
        .map_err(|e| format!("Failed to create post directory '{}': {e}", slug))?;

    let tag_list = if args.tags.is_empty() {
        "[]".to_string()
    } else {
        let inner: Vec<String> = args
            .tags
            .iter()
            .map(|t| format!("\"{}\"", escape_yaml_string(t)))
            .collect();
        format!("[{}]", inner.join(", "))
    };

    let date = today_iso();
    let content = format!(
        "---\ntitle: \"{}\"\nsummary: \"{}\"\ncreatedDate: \"{}\"\nisDraft: true\ntags: {}\n---\n",
        escape_yaml_string(&args.title),
        escape_yaml_string(&args.summary),
        date,
        tag_list
    );

    let file_path = post_dir.join("index.mdx");
    fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write post file: {e}"))?;

    Ok(ContentEntry {
        slug,
        content_type: "post".into(),
        title: args.title,
        summary: args.summary,
        tags: args.tags,
        is_draft: true,
        created_date: date,
        publication_date: None,
        author: Some("Filipe Lima".into()),
        image: None,
        file_path: file_path.to_string_lossy().to_string(),
        modified_date: None,
    })
}

/// Create a new app directory with frontmatter and an Astro component scaffold.
pub fn create_app(repo_path: &str, args: CreateAppArgs) -> Result<ContentEntry, String> {
    let slug = if args.slug.is_empty() {
        to_slug(&args.title)
    } else {
        args.slug
    };
    let app_dir = Path::new(repo_path)
        .join("src/content/apps")
        .join(&slug);

    if app_dir.exists() {
        return Err(format!("App \"{}\" already exists.", slug));
    }

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory '{}': {e}", slug))?;

    let mut tags = args.tags.clone();
    if !tags.contains(&"app".to_string()) {
        tags.insert(0, "app".to_string());
    }

    let tag_list = if tags.is_empty() {
        "[]".to_string()
    } else {
        let inner: Vec<String> = tags
            .iter()
            .map(|t| format!("\"{}\"", escape_yaml_string(t)))
            .collect();
        format!("[{}]", inner.join(", "))
    };

    let date = today_iso();
    let index_content = format!(
        "---\ntitle: \"{}\"\nsummary: \"{}\"\ncreatedDate: {}\nisDraft: true\ntags: {}\n---\n",
        escape_yaml_string(&args.title),
        escape_yaml_string(&args.summary),
        date,
        tag_list
    );

    let app_astro = format!(
        r#"---
/**
 * {} -- App Component
 */
---

<div class="{}-root" id="{}-root">
  <p class="{}-placeholder">App goes here.</p>
</div>

<style>
  .{}-root {{
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--color-text);
  }}

  .{}-placeholder {{
    font-family: var(--font-serif);
    font-size: var(--font-size-h3);
    color: var(--color-text-muted);
  }}
</style>

<script>
  import {{ onPageReady }} from "../../../utils/lifecycle";

  onPageReady((signal) => {{
    const root = document.getElementById("{}-root");
    if (!root) return;

    const themeObserver = new MutationObserver(() => {{}});
    themeObserver.observe(document.documentElement, {{
      attributes: true,
      attributeFilter: ["data-theme"],
    }});
    signal.addEventListener("abort", () => themeObserver.disconnect());
  }});
</script>
"#,
        slug, slug, slug, slug, slug, slug, slug
    );

    let index_path = app_dir.join("index.md");
    let astro_path = app_dir.join("App.astro");
    fs::write(&index_path, &index_content)
        .map_err(|e| format!("Failed to write app index file: {e}"))?;
    fs::write(&astro_path, &app_astro)
        .map_err(|e| format!("Failed to write App.astro: {e}"))?;

    Ok(ContentEntry {
        slug,
        content_type: "app".into(),
        title: args.title,
        summary: args.summary,
        tags,
        is_draft: true,
        created_date: date,
        publication_date: None,
        author: None,
        image: None,
        file_path: index_path.to_string_lossy().to_string(),
        modified_date: None,
    })
}

/// Delete a content entry by slug, removing its directory and committing via git.
pub fn delete_content(repo_path: &str, slug: &str) -> Result<(), String> {
    if slug.contains("..") || slug.contains('/') || slug.contains('\\') {
        return Err("Invalid slug".to_string());
    }

    let base = Path::new(repo_path);

    // Check blog dir
    let blog_dir = base.join("src/content/blog").join(slug);
    if blog_dir.is_dir() {
        fs::remove_dir_all(&blog_dir)
            .map_err(|e| format!("Failed to delete blog directory '{}': {e}", slug))?;
        git_add_commit_push(
            repo_path,
            &format!("src/content/blog/{}", slug),
            &format!("delete: {}", slug),
        )?;
        return Ok(());
    }

    // Check apps dir
    let app_dir = base.join("src/content/apps").join(slug);
    if app_dir.is_dir() {
        fs::remove_dir_all(&app_dir)
            .map_err(|e| format!("Failed to delete app directory '{}': {e}", slug))?;
        git_add_commit_push(
            repo_path,
            &format!("src/content/apps/{}", slug),
            &format!("delete: {}", slug),
        )?;
        return Ok(());
    }

    Err(format!("No content found for slug \"{}\".", slug))
}

/// Resolve a slug to its content file path and type ("post" or "app").
pub fn find_content_file(base: &Path, slug: &str) -> Result<(PathBuf, String), String> {
    // Check blog
    let blog_dir = base.join("src/content/blog").join(slug);
    if blog_dir.is_dir() {
        let mdx = blog_dir.join("index.mdx");
        if mdx.exists() {
            return Ok((mdx, "post".into()));
        }
        let md = blog_dir.join("index.md");
        if md.exists() {
            return Ok((md, "post".into()));
        }
    }

    // Check apps
    let app_dir = base.join("src/content/apps").join(slug);
    if app_dir.is_dir() {
        let md = app_dir.join("index.md");
        if md.exists() {
            return Ok((md, "app".into()));
        }
    }

    Err(format!("No content found for slug \"{}\".", slug))
}
