//! A previewed frame is immutable and tied to the window/process it came from.
use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine as _;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::overlay::GameInfo;

#[derive(Clone)]
struct Frame {
    id: u64,
    game: GameInfo,
    png: Vec<u8>,
}

#[derive(Default)]
pub(crate) struct CaptureState {
    sequence: AtomicU64,
    frame: Mutex<Option<Frame>>,
}

impl CaptureState {
    pub(crate) fn image(&self, id: u64, game: &GameInfo) -> Result<Vec<u8>, String> {
        self.frame
            .lock()
            .as_ref()
            .filter(|frame| frame.id == id && same_target(&frame.game, game))
            .map(|frame| frame.png.clone())
            .ok_or_else(|| {
                "The screenshot has expired or belongs to another window. Retake it.".to_owned()
            })
    }
}

fn same_target(a: &GameInfo, b: &GameInfo) -> bool {
    a.hwnd == b.hwnd && a.pid == b.pid && a.exe == b.exe
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Preview {
    id: u64,
    data_url: String,
    captured_at: String,
}

pub(crate) fn target(app: &AppHandle, hwnd: i64, pid: u32) -> Result<GameInfo, String> {
    crate::overlay::live_game(app)
        .filter(|game| game.hwnd == hwnd && game.pid == pid)
        .ok_or_else(|| {
            "The game window changed or closed. Open the overlay over the game again.".to_owned()
        })
}

#[tauri::command]
pub(crate) async fn capture_game(app: AppHandle, hwnd: i64, pid: u32) -> Result<Preview, String> {
    let game = target(&app, hwnd, pid)?;
    let id = app
        .state::<CaptureState>()
        .sequence
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    let png = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::task::spawn_blocking(move || crate::overlay_capture::capture_window_png(hwnd)),
    )
    .await
    .map_err(|_| "Screenshot capture timed out. Try windowed or borderless mode.".to_owned())?
    .map_err(|e| format!("Capture task failed: {e}"))??;
    if !same_target(&target(&app, hwnd, pid)?, &game) {
        return Err("The target changed during capture. Please retake.".to_owned());
    }
    let state = app.state::<CaptureState>();
    let mut slot = state.frame.lock();
    if state.sequence.load(Ordering::SeqCst) != id {
        return Err("A newer capture replaced this one.".to_owned());
    }
    let data_url = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    );
    *slot = Some(Frame { id, game, png });
    drop(slot);
    Ok(Preview {
        id,
        data_url,
        captured_at: chrono::Local::now().format("%H:%M:%S").to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reused_window_or_old_frame_cannot_be_sent() {
        let game = GameInfo {
            hwnd: 10,
            pid: 42,
            exe: "game.exe".into(),
            title: "Game".into(),
        };
        let state = CaptureState::default();
        *state.frame.lock() = Some(Frame {
            id: 2,
            game: game.clone(),
            png: vec![1, 2],
        });
        assert!(state.image(2, &game).is_ok());
        assert!(state.image(1, &game).is_err());
        let reused = GameInfo { pid: 99, ..game };
        assert!(state.image(2, &reused).is_err());
    }
}
