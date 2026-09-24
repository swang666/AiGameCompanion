//! Overlay AI commands: streaming dispatch, cancellation, provider availability,
//! and persisting the selected provider.

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::ai::{AiState, ChatMessage, Provider, ProviderAvailability, RequestParams, SageEvent};
use crate::state::AppState;

/// Report which providers can currently serve a request (for the UI dropdown).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn available_providers(ai: State<'_, AiState>) -> ProviderAvailability {
    ai.availability()
}

/// Start a streaming chat request. Tokens arrive on `channel`; issuing a newer
/// request cancels this one.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AskInput {
    request_id: u64,
    conversation_id: u64,
    provider: Provider,
    #[serde(default)]
    model: Option<String>,
    messages: Vec<ChatMessage>,
    hwnd: i64,
    pid: u32,
    game_title: String,
    capture_id: Option<u64>,
    hint_only: bool,
}

#[tauri::command]
#[allow(clippy::too_many_arguments, clippy::needless_pass_by_value)]
pub(crate) fn ask_sage(
    app: AppHandle,
    request: AskInput,
    channel: Channel<SageEvent>,
) -> Result<(), String> {
    if let Some(model) = request.model.as_deref() {
        crate::ai::validate_model_name(model)?;
    }
    if request.messages.is_empty()
        || request.messages.len() > 25
        || request
            .messages
            .iter()
            .any(|m| !matches!(m.role.as_str(), "user" | "assistant"))
        || request
            .messages
            .iter()
            .map(|m| m.content.len())
            .sum::<usize>()
            > 100_000
    {
        return Err("The conversation is too long. Start a new chat.".to_owned());
    }
    let mut game = crate::capture::target(&app, request.hwnd, request.pid)?;
    let image = request
        .capture_id
        .map(|id| app.state::<crate::capture::CaptureState>().image(id, &game))
        .transpose()?;
    if !request.game_title.trim().is_empty() {
        game.title = request.game_title.trim().chars().take(200).collect();
    }
    crate::ai::spawn_request(
        &app,
        RequestParams {
            request_id: request.request_id,
            conversation_id: request.conversation_id,
            provider: request.provider,
            model: request.model,
            messages: request.messages,
            game,
            image,
            hint_only: request.hint_only,
        },
        channel,
    );
    Ok(())
}

/// Cancel the in-flight request if it matches `request_id` (Stop button).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn cancel_sage(ai: State<'_, AiState>, request_id: u64) {
    ai.cancel(request_id);
}

/// Persist the user's selected provider so it survives restarts.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn set_active_provider(
    provider: Provider,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut launcher = state.launcher.lock();
        provider
            .as_str()
            .clone_into(&mut launcher.settings.active_provider);
    }
    state.save()
}

/// Persist one provider's model choice; blank restores its existing default.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn set_model_override(
    provider: Provider,
    model: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let model = model.trim();
    if !model.is_empty() {
        crate::ai::validate_model_name(model)?;
    }
    {
        let mut launcher = state.launcher.lock();
        if model.is_empty() {
            launcher.settings.model_overrides.remove(provider.as_str());
        } else {
            launcher
                .settings
                .model_overrides
                .insert(provider.as_str().to_owned(), model.to_owned());
        }
    }
    state.save()
}

#[derive(serde::Serialize)]
pub(crate) struct TranslateResult {
    pub text: String,
}

/// Capture the detected game window and translate its on-screen foreign text to
/// English. One-shot (not part of the streaming chat slot).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) async fn translate_screen(app: AppHandle) -> Result<TranslateResult, String> {
    // Revalidated, not just read: capturing a recycled handle would screenshot
    // an unrelated window and upload it to a cloud provider.
    let hwnd = crate::overlay::live_game(&app)
        .map(|game| game.hwnd)
        .ok_or_else(|| "No game detected -- open the overlay over a game first.".to_owned())?;
    let text = crate::ai::translate_capture(hwnd).await?;
    Ok(TranslateResult { text })
}

/// Store (or clear, when empty) the Gemini API key in OS secret storage. Returns
/// the refreshed availability so the UI can flip the Gemini pill without a
/// restart. The key is never returned or logged.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn set_gemini_key(
    ai: State<'_, AiState>,
    key: String,
) -> Result<ProviderAvailability, String> {
    crate::secrets::set_gemini_key(key.trim())?;
    Ok(ai.availability())
}

/// Re-run CLI detection (claude/codex) off the UI thread and return the refreshed
/// availability.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) async fn recheck_clis(ai: State<'_, AiState>) -> Result<ProviderAvailability, String> {
    let cfg = tokio::task::spawn_blocking(crate::ai::detect_all)
        .await
        .map_err(|error| format!("CLI re-check failed: {error}"))?;
    ai.set_cli(cfg);
    Ok(ai.availability())
}
