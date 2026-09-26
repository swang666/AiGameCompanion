//! Local-only transcription using the pinned whisper.cpp runtime installed by setup-voice.ps1.
use base64::Engine as _;
use parking_lot::Mutex;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub(crate) struct VoiceState {
    active: Mutex<Option<(u64, tokio::sync::oneshot::Sender<()>)>>,
    last_cancelled: std::sync::atomic::AtomicU64,
}

impl VoiceState {
    pub(crate) fn cancel(&self, id: u64) {
        let mut slot = self.active.lock();
        self.last_cancelled
            .fetch_max(id, std::sync::atomic::Ordering::SeqCst);
        if let Some((_, sender)) = slot.take_if(|(active, _)| *active == id) {
            let _ = sender.send(());
        }
    }
}

fn voice_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let portable = parent.join("voice");
            if portable.join("whisper-cli.exe").is_file() {
                return Ok(portable);
            }
        }
    }
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("voice"))
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub(crate) struct VoiceStatus {
    ready: bool,
    message: String,
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn voice_status(app: AppHandle) -> Result<VoiceStatus, String> {
    let dir = voice_dir(&app)?;
    let ready = dir.join("whisper-cli.exe").is_file() && dir.join("ggml-base.bin").is_file();
    Ok(VoiceStatus {
        ready,
        message: if ready {
            "Local voice · multilingual".into()
        } else {
            "Voice needs a one-time setup: run scripts/setup-voice.ps1. You can also use Win+H in the question box.".into()
        },
    })
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn cancel_voice(state: State<'_, VoiceState>, request_id: u64) {
    state.cancel(request_id);
}

fn validate_wav(bytes: &[u8]) -> Result<(), String> {
    // The recorder emits exactly PCM16 / mono / 16 kHz with a canonical 44-byte header.
    let valid = bytes.len() > 44
        && bytes.len() <= 44 + 16_000 * 2 * 45
        && &bytes[..4] == b"RIFF"
        && &bytes[8..16] == b"WAVEfmt "
        && bytes[16..20] == 16_u32.to_le_bytes()
        && bytes[20..24] == [1, 0, 1, 0]
        && bytes[24..28] == 16_000_u32.to_le_bytes()
        && bytes[28..32] == 32_000_u32.to_le_bytes()
        && bytes[32..36] == [2, 0, 16, 0]
        && &bytes[36..40] == b"data"
        && u32::from_le_bytes(bytes[40..44].try_into().map_err(|_| "Invalid WAV header")?) as usize
            == bytes.len() - 44;
    if valid {
        Ok(())
    } else {
        Err("Record up to 45 seconds of mono PCM16 audio at 16 kHz.".into())
    }
}

fn validate_language(language: &str) -> Result<(), String> {
    if language == "auto"
        || (language.len() == 2 && language.bytes().all(|byte| byte.is_ascii_lowercase()))
    {
        Ok(())
    } else {
        Err("Choose a supported speech language.".into())
    }
}

#[tauri::command]
pub(crate) async fn transcribe_voice(
    app: AppHandle,
    request_id: u64,
    wav: String,
    language: String,
) -> Result<String, String> {
    validate_language(&language)?;
    if wav.len() > 2_000_000 {
        return Err("Recording is too long.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(wav)
        .map_err(|e| e.to_string())?;
    validate_wav(&bytes)?;
    let dir = voice_dir(&app)?;
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = temp.path().join("question.wav");
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let mut cmd = tokio::process::Command::new(dir.join("whisper-cli.exe"));
    cmd.args(["-m"])
        .arg(dir.join("ggml-base.bin"))
        .arg("-f")
        .arg(&path)
        .args(["-l", &language, "-nt", "-np", "-t", "4", "-ng"])
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let (cancel, cancelled) = tokio::sync::oneshot::channel();
    let state = app.state::<VoiceState>();
    let previous = {
        let mut slot = state.active.lock();
        if request_id
            <= state
                .last_cancelled
                .load(std::sync::atomic::Ordering::SeqCst)
        {
            return Err("Transcription cancelled.".into());
        }
        slot.replace((request_id, cancel))
    };
    if let Some((_, old)) = previous {
        let _ = old.send(());
    }
    let result = tokio::select! {
        _ = cancelled => Err("Transcription cancelled.".to_owned()),
        output = tokio::time::timeout(std::time::Duration::from_secs(90), cmd.output()) => {
            match output {
                Ok(Ok(output)) if output.status.success() => {
                    let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
                    if text.is_empty() { Err("No speech recognized. Please try again.".into()) } else { Ok(text) }
                }
                Ok(Ok(output)) => Err(format!("Voice failed: {}", String::from_utf8_lossy(&output.stderr).chars().take(500).collect::<String>())),
                Ok(Err(e)) => Err(format!("Cannot start local voice: {e}. Run scripts/setup-voice.ps1.")),
                Err(_) => Err("Local transcription timed out. Try a shorter question.".into()),
            }
        }
    };
    app.state::<VoiceState>()
        .active
        .lock()
        .take_if(|(id, _)| *id == request_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_truncated_or_non_audio_payloads() {
        assert!(validate_wav(&[]).is_err());
        assert!(validate_wav(&[0; 48]).is_err());
        assert!(validate_wav(&vec![0; 1_500_000]).is_err());
    }

    #[test]
    fn accepts_chinese_and_auto_but_rejects_invalid_language_codes() {
        assert!(validate_language("zh").is_ok());
        assert!(validate_language("auto").is_ok());
        assert!(validate_language("zh;rm").is_err());
        assert!(validate_language("korean").is_err());
    }
}
