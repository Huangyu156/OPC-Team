use crate::util::errors::{OpcTeamError, OpcTeamResult};

#[cfg(test)]
pub(crate) use tool_runtime::web_readable::{html_to_text, looks_noisy};
pub(crate) use tool_runtime::web_readable::{
    is_html, ReadableWebOutput as ReadableOutput, RequestedWebFetchFormat as RequestedFormat,
};

pub(crate) fn normalize_requested_format(format: Option<&str>) -> OpcTeamResult<RequestedFormat> {
    tool_runtime::web_readable::normalize_requested_format(format).map_err(OpcTeamError::tool)
}

pub(crate) fn extract_markdown_with_text_fallback(
    html: &str,
    base_url: &str,
) -> OpcTeamResult<ReadableOutput> {
    tool_runtime::web_readable::extract_markdown_with_text_fallback(html, base_url)
        .map_err(OpcTeamError::tool)
}

pub(crate) fn extract_html_title(html: &str) -> Option<String> {
    tool_runtime::web_readable::extract_html_title(html)
}
