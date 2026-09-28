//! Identify Sage to the embedded video player without changing other requests.
//! <https://developers.google.com/youtube/terms/required-minimum-functionality>

#[cfg(windows)]
pub(crate) fn install(window: &tauri::WebviewWindow) {
    use tauri::Manager;
    use webview2_com::{
        take_pwstr, Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
        WebResourceRequestedEventHandler,
    };
    use webview_windows_core::{w, HSTRING, PWSTR};

    let identity = HSTRING::from(format!(
        "https://{}/",
        window.app_handle().config().identifier
    ));
    crate::util::log_if_err(
        "configure video webview",
        window.with_webview(move |webview| {
            let configure = || -> webview_windows_core::Result<()> {
                // SAFETY: with_webview runs on the WebView2 UI thread. COM owns the
                // registered handler until this webview is destroyed; captured data
                // is owned, and all request/header pointers are checked by bindings.
                unsafe {
                    let core = webview.controller().CoreWebView2()?;
                    core.AddWebResourceRequestedFilter(
                        w!("https://www.youtube.com/embed/*"),
                        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
                    )?;
                    let handler =
                        WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                            if let Some(args) = args {
                                let request = args.Request()?;
                                let mut uri = PWSTR::null();
                                request.Uri(&raw mut uri)?;
                                let uri = take_pwstr(uri);
                                // Filters are shared with Tauri's custom-protocol handler.
                                // Recheck here so app identity never leaks to other hosts.
                                if is_youtube_embed(&uri) {
                                    request.Headers()?.SetHeader(w!("Referer"), &identity)?;
                                }
                            }
                            Ok(())
                        }));
                    let mut token = 0;
                    core.add_WebResourceRequested(&handler, &raw mut token)?;
                }
                Ok(())
            };
            crate::util::log_if_err("set video app identity", configure());
        }),
    );
}

#[cfg(not(windows))]
pub(crate) const fn install(_window: &tauri::WebviewWindow) {}

#[cfg(any(windows, test))]
fn is_youtube_embed(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("www.youtube.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.path().strip_prefix("/embed/").is_some_and(|id| {
            id.len() == 11
                && id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        })
}

#[cfg(test)]
mod tests {
    #[test]
    fn identity_is_only_attached_to_exact_player_requests() {
        assert!(super::is_youtube_embed(
            "https://www.youtube.com/embed/M7lc1UVf-VE?start=30"
        ));
        for raw in [
            "http://www.youtube.com/embed/M7lc1UVf-VE",
            "https://www.youtube.com.evil.test/embed/M7lc1UVf-VE",
            "https://www.youtube.com/watch?v=M7lc1UVf-VE",
            "https://u:p@www.youtube.com/embed/M7lc1UVf-VE",
            "https://www.youtube.com:8080/embed/M7lc1UVf-VE",
            "https://www.youtube.com/embed/invalid",
            "http://tauri.localhost/",
        ] {
            assert!(!super::is_youtube_embed(raw), "{raw}");
        }
    }
}
