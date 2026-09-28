# Sage: Windows setup and use

Sage is a fork of [AI Game Companion by Wintersta7e](https://github.com/Wintersta7e/AiGameCompanion). It adds local voice transcription, live research through your signed-in Claude Code or Codex CLI, screenshot preview, per-game conversations, model selection, and adjustable text size. The original author's [MIT license](LICENSE) remains in this repository and beside the built executable.

This guide is for a clean **Windows 10/11 x64** machine. If you want an AI coding assistant to perform the setup, give it the prompt in [SETUP-WITH-AI.md](SETUP-WITH-AI.md).

## 1. Install build prerequisites

Install these from their official sites, then open a **new PowerShell window** so updated PATH entries are visible:

| Prerequisite | What to install |
| --- | --- |
| [Git for Windows](https://git-scm.com/download/win) | Needed to clone the repository. |
| [Node.js](https://nodejs.org/en/download) | Node 22.13+ or 24+ with npm. |
| [Rust](https://rustup.rs/) | Stable Rust with the default `x86_64-pc-windows-msvc` toolchain. Use the standard rustup location under your user profile; the build script looks for `%USERPROFILE%\.cargo\bin\cargo.exe`. |
| [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) | Select **Desktop development with C++**, including the MSVC x64/x86 build tools and Windows SDK. A full Visual Studio installation with that workload also works. |
| [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/#download-section) | Needed to run the Tauri windows. It may already be installed; install the Evergreen Runtime if Sage fails to open. |

Check the command-line tools in PowerShell:

```powershell
git --version
node --version
npm --version
& "$env:USERPROFILE\.cargo\bin\cargo.exe" --version
```

## 2. Choose an AI provider

Set up **at least one** provider. Claude Code and Codex reuse their own sign-in; Sage does not need their API keys.

- **Claude:** Install [Claude Code](https://code.claude.com/docs/en/setup), run `claude` in a terminal, and complete its sign-in. Check `claude --version` in a new PowerShell window.
- **Codex:** Install the [Codex CLI](https://developers.openai.com/codex/cli), run `codex` in a terminal, and complete its sign-in. Check `codex --version`. Sage can also detect a Codex Desktop installation. A WSL Codex CLI is supported, but native Windows Codex is the route for screenshot questions.
- **Gemini:** Get a key from [Google AI Studio](https://aistudio.google.com/apikey), then enter it in **Sage → Settings → Providers**. Sage stores it in Windows Credential Manager. Gemini works for questions and screenshots, but this fork does not provide live web research through Gemini.

The provider choices are enabled when Sage detects an installed CLI or a Gemini key. The CLI must also be signed in before it can answer. After installing or signing in to a CLI, press **Settings → Providers → Re-check CLIs**; restart Sage if the CLI was just added to PATH. `config.toml` is **not required**. The old [config.example.toml](config.example.toml) format is an optional plaintext fallback for Gemini, and should not be used unless you specifically need it.

## 3. Clone and build

On this fork's GitHub page, select **Code → HTTPS** and copy the clone URL. In PowerShell:

```powershell
git clone https://github.com/swang666/AiGameCompanion.git
cd AiGameCompanion
git switch feature/universal-voice-search
& .\scripts\build-windows.ps1 -WithVoice
```

The build installs the locked frontend dependencies, builds the Rust app, and creates `out\Sage\Sage.exe`. The `-WithVoice` option downloads a pinned whisper.cpp Windows runtime and multilingual base model, checks their SHA-256 hashes, and places them in `out\Sage\voice`. This needs internet access for dependencies and the voice files; the model alone is about 148 MB. The first Rust build can take a while. Close Sage before rebuilding so Windows does not lock `Sage.exe`.

If your PowerShell policy blocks local scripts, run the build in a one-time process with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1 -WithVoice
```

To build without bundling voice, omit `-WithVoice`. You can add local voice later with `& .\scripts\setup-voice.ps1`; that installs it under `%APPDATA%\com.aigamecompanion.launcher\voice` for this PC. To carry Sage to another PC, use the `-WithVoice` build and copy the **whole** `out\Sage` directory, including `voice` and `LICENSE`.

## 4. Run and test

### Automatic walkthrough videos

For gameplay questions, Sage instructs Claude Code and Codex to search for relevant YouTube videos alongside written sources, using your question, game edition, screenshot, and current progress. You do not need to ask for a video. It prefers your language and asks the assistant to respect hints-first and avoid later spoilers. Video selection depends on the search results; if nothing suitable is found, the answer can contain no video.

Completed answers automatically show up to two distinct YouTube video cards. Click **Play in chat** to load a player; cards do not load YouTube content or start audio until clicked. Source-provided timestamps are preserved. You can resize the overlay or use the player's full-screen control. Starting another video closes the first. Closing the overlay (including **Ctrl+Shift+G**), changing games, or starting a new chat stops playback. When focus is inside the player, use the global **Ctrl+Shift+G** shortcut to return to your game.

Use **Open in browser** if a video is private, region/age restricted, or disallows embedding, or if the embedded player cannot load. Internet access is required; YouTube may show ads. Sage uses the official player and does not download videos. Other websites remain clickable source links. Gemini currently has no live search integration, so it cannot automatically discover current video results. Embedding a video does not mean the assistant watched or verified its entire contents.

The Windows build identifies Sage to YouTube through a narrowly scoped WebView2 request header. Embedded pages are not granted native app permissions. No YouTube API key or extra setup is needed for playback of returned links.

### Optional: stronger voice recognition with an NVIDIA GPU

For an NVIDIA GPU with sufficient free VRAM and a current driver, install Whisper **large-v3-turbo** with the CUDA runtime:

```powershell
& .\scripts\setup-voice.ps1 -Destination .\out\Sage\voice -Gpu
```

Or build and bundle it in one step with `& .\scripts\build-windows.ps1 -GpuVoice`. The GPU option downloads about 2 GB of additional files (1.62 GB model plus CUDA runtime), verifies their hashes, and keeps the smaller base model for CPU fallback. The runtime includes its CUDA libraries; a separate CUDA Toolkit installation is not required. Copy the whole `out\Sage` folder if moving the app. Install into the `voice` folder beside the executable you actually run: that portable folder takes precedence over the app-data installation.

Sage prefers Turbo when both its model and CUDA executable are installed. The voice status shows **GPU preferred** initially, then the engine actually used after transcription. If the GPU process fails or times out, Sage retries using **Whisper Base · CPU fallback**. Each attempt has a 45-second limit and can be cancelled. The transcription process exits after each recording, releasing its GPU memory; the first request can take longer while files load. Recognition still runs locally and has no transcription API fee.

### Start Sage

```powershell
& .\out\Sage\Sage.exe
```

Open **Settings → Providers** and confirm your provider is detected. Start a game in windowed or borderless fullscreen mode, focus it, then press **Ctrl+Shift+G**. Confirm that Sage shows the right game title and screenshot preview, type a question, and press **Enter** or click **Send**. You can uncheck **Screenshot** to ask using text alone; use **Retake** when the scene changes.

| Action | Shortcut |
| --- | --- |
| Toggle Sage and capture the game | **Ctrl+Shift+G** |
| Start or stop recording | **Ctrl+Shift+V** |
| Ask for a hint | **Ctrl+Shift+A** |
| Translate the current screen | **Ctrl+Shift+T** |
| Send a typed or transcribed question | **Enter** in the question box |
| Close Sage and return to the game | **Esc** |

For voice, choose **Speech language** before recording. It defaults to **Chinese (中文)** in this fork; use English or Auto-detect when appropriate. Speak after pressing **Ctrl+Shift+V**, press it again to stop, correct the transcript if needed, then press **Enter**. Whisper runs locally and transcribes in the selected language. It has no separate API fee. If local voice is not installed, Windows **Win+H** dictation also works in the question box.

The **Model** dropdown offers **Default**, provider-specific presets, and **Custom model…** for entering a model ID or alias. Presets are suggestions, not a live list of models your account can access. Choose Default to use the provider's existing settings; custom IDs are saved and restored too. The choice is saved separately for Claude, Codex, and Gemini and takes effect on the next question. **Hints first** asks for brief, lower-spoiler help. Change **Text size** in **Settings → Launcher**, or use **A− / A+** in the overlay. Chats are kept separately for each detected game executable while Sage is running.

## Troubleshooting

- **“No assistant detected,” or Claude/Codex is greyed out:** First verify the CLI runs and is signed in from a new PowerShell window (`claude --version` or `codex --version`), then choose **Re-check CLIs** in Sage. Restart Sage after changing PATH. Codex Desktop and WSL may also be detected, but a native CLI gives the most direct screenshot support.
- **`config.toml not found`:** That was an older setup path. Build and run this branch, then enter a Gemini key in **Settings → Providers** if using Gemini. Claude and Codex need no `config.toml`.
- **Chinese speech appears in another language:** Choose **Chinese (中文)** rather than Auto-detect before recording. Check the transcript before sending.
- **Voice is unavailable:** Build with `-WithVoice` or run `scripts\setup-voice.ps1`; keep the `voice` folder beside `Sage.exe` for a portable build. Windows microphone access must be allowed for desktop apps. For GPU voice, use `-Gpu` as shown above and check the reported engine after a recording; CPU fallback indicates the GPU attempt failed. Update the NVIDIA driver or free GPU memory before retrying.
- **Overlay or screenshot is missing/black:** Use windowed or borderless fullscreen mode. An external overlay cannot display over true exclusive fullscreen, and protected or minimized game windows may resist capture.
- **Build fails at Rust linking:** Confirm the Visual Studio **Desktop development with C++** workload and Windows SDK are installed, then open a fresh PowerShell window. If copying `Sage.exe` fails, close the running app first.

The original project's longer description remains in the repository's `README.md` below the fork notice. It describes upstream behavior at the fork point; use this guide for the current Windows build.
