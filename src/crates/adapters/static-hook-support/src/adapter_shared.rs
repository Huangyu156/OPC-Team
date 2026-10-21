//! Shared helpers used by every static ecosystem source adapter.
//!
//! These functions were previously copy-pasted into `opencode-adapter`,
//! `claude-code-adapter`, and `codex-adapter`. They are provider-neutral: each
//! one takes explicit arguments and returns plain data, so a single copy here
//! replaces every duplicate without changing adapter behavior.

use opc_product_domains::external_sources::ExternalSourceContext;
use opc_services_core::workspace_text::normalize_workspace_relative_path;
use regex::Regex;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use url::Url;

/// Upper bound on environment/header entries parsed from one MCP declaration.
pub(crate) const MAX_MCP_MAP_ENTRIES: usize = 128;

/// Returns the directories between `root` (inclusive) and `opened` (inclusive).
///
/// When `opened` is a file its parent directory is used instead, so the result
/// always describes directories. Paths outside `root` are dropped.
pub fn directories_between(root: &Path, opened: &Path) -> Vec<PathBuf> {
    let opened = if opened.is_file() {
        opened.parent().unwrap_or(opened)
    } else {
        opened
    };
    let mut directories = opened
        .ancestors()
        .take_while(|path| path.starts_with(root))
        .map(Path::to_path_buf)
        .collect::<Vec<_>>();
    directories.reverse();
    directories
}

/// Resolves `.` and `..` components lexically, without touching the filesystem.
pub fn normalize_path_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            component => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

/// Renders a workspace-relative preview of `path`, or `<configured>` when the
/// path sits outside the workspace root.
pub fn cwd_preview(path: &Path, context: &ExternalSourceContext) -> String {
    context
        .workspace_root
        .as_ref()
        .and_then(|workspace| path.strip_prefix(workspace).ok())
        .map(|relative| {
            if relative.as_os_str().is_empty() {
                ".".to_string()
            } else {
                format!("./{}", relative.to_string_lossy().replace('\\', "/"))
            }
        })
        .unwrap_or_else(|| "<configured>".to_string())
}

/// Parses an HTTPS URL and strips credentials, path, query, and fragment so the
/// value can be shown in diagnostics without leaking secrets.
pub fn sanitized_https_origin(value: &str) -> Result<String, String> {
    let mut url = Url::parse(value).map_err(|_| "Remote MCP URL is invalid".to_string())?;
    if url.scheme() != "https" {
        return Err("Remote MCP URL must use HTTPS".to_string());
    }
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

/// Parses a JSON object into a string map, rejecting non-string values and
/// maps larger than [`MAX_MCP_MAP_ENTRIES`].
pub fn string_map(value: Option<&Value>) -> Result<BTreeMap<String, String>, String> {
    let Some(value) = value else {
        return Ok(BTreeMap::new());
    };
    let object = value
        .as_object()
        .ok_or_else(|| "MCP environment or headers must be an object".to_string())?;
    if object.len() > MAX_MCP_MAP_ENTRIES {
        return Err(format!(
            "MCP environment or headers exceed the {MAX_MCP_MAP_ENTRIES} entry limit"
        ));
    }
    object
        .iter()
        .map(|(key, value)| {
            value
                .as_str()
                .map(|value| (key.clone(), value.to_string()))
                .ok_or_else(|| "MCP environment and header values must be strings".to_string())
        })
        .collect()
}

/// Matches `@path` file references inside a command template.
pub fn command_file_reference_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"(?:^|[^\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)")
            .expect("static file reference regex must compile")
    })
}

/// Reports whether a `@path` reference contains template syntax rather than a
/// literal path.
pub fn is_dynamic_file_reference(path: &str) -> bool {
    path.contains('$') || path.contains('{') || path.contains('}')
}

/// Collects the distinct literal file references declared by a command template.
pub fn literal_file_references(template: &str) -> Vec<String> {
    let mut seen = BTreeSet::new();
    command_file_reference_regex()
        .captures_iter(template)
        .filter_map(|capture| capture.get(1).map(|value| value.as_str()))
        .filter(|path| !is_dynamic_file_reference(path))
        .filter_map(|path| normalize_workspace_relative_path(path).ok())
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

/// Collects the capability facts implied by a command template's `@path`
/// references: dynamic references and paths that cannot be normalized safely.
pub fn file_reference_capabilities(template: &str) -> Vec<String> {
    let mut capabilities = Vec::new();
    for path in command_file_reference_regex()
        .captures_iter(template)
        .filter_map(|capture| capture.get(1).map(|value| value.as_str()))
    {
        if is_dynamic_file_reference(path) {
            capabilities.push("command.file_reference.dynamic".to_string());
        } else if normalize_workspace_relative_path(path).is_err() {
            capabilities.push("command.file_reference.unsafe_path".to_string());
        }
    }
    capabilities
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn directories_between_walks_from_root_to_opened() {
        let root = Path::new("/work");
        let opened = Path::new("/work/a/b/c");
        let directories = directories_between(root, opened);
        assert_eq!(
            directories,
            vec![
                PathBuf::from("/work"),
                PathBuf::from("/work/a"),
                PathBuf::from("/work/a/b"),
                PathBuf::from("/work/a/b/c"),
            ]
        );
    }

    #[test]
    fn normalize_path_lexically_removes_dot_and_parent_components() {
        assert_eq!(
            normalize_path_lexically(Path::new("./a/./b/../c")),
            PathBuf::from("a/c")
        );
    }

    #[test]
    fn sanitized_https_origin_drops_credentials_and_path() {
        let origin =
            sanitized_https_origin("https://user:secret@example.com/sse?token=abc#frag").unwrap();
        assert_eq!(origin, "https://example.com/");
    }

    #[test]
    fn sanitized_https_origin_rejects_plain_http() {
        assert!(sanitized_https_origin("http://example.com/sse").is_err());
    }

    #[test]
    fn string_map_rejects_non_string_values() {
        let value = serde_json::json!({ "A": 1 });
        assert!(string_map(Some(&value)).is_err());
    }

    #[test]
    fn string_map_accepts_string_values() {
        let value = serde_json::json!({ "A": "1", "B": "2" });
        let map = string_map(Some(&value)).unwrap();
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn command_file_reference_regex_finds_at_paths() {
        let captures = command_file_reference_regex()
            .captures_iter("read @src/main.rs then @docs/readme.md")
            .filter_map(|capture| capture.get(1).map(|value| value.as_str().to_string()))
            .collect::<Vec<_>>();
        assert_eq!(captures, vec!["src/main.rs", "docs/readme.md"]);
    }
}
