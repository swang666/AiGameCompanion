# Sage: voice and web research over your game

This is a local extension of [AI Game Companion](https://github.com/Wintersta7e/AiGameCompanion), built from its MIT-licensed source. It works with a game in windowed or borderless mode and the installed **Claude Code** or **Codex** client. Both clients use their existing login and online model. The microphone is transcribed locally with whisper.cpp. Game screenshots and questions go to the selected model when you press Send.

## Start playing

1. Install and sign in to [Claude Code](https://code.claude.com/docs/en/setup) or [Codex](https://learn.chatgpt.com/docs/installing-codex) if you have not already. On this machine, both clients are installed. Their account access still has to be confirmed with a real query.
2. Run `scripts/build-windows.ps1 -WithVoice` in PowerShell. It builds `out/Sage/Sage.exe` with the voice runtime beside it. The voice runtime can also be installed just for this PC with `scripts/setup-voice.ps1`.
3. Start `out/Sage/Sage.exe`. Bring your game to the foreground, then press **Ctrl+Shift+G**. The overlay opens and captures a frame. Check the preview; use Retake if the scene has changed.
4. Click **Speak**, ask your question, click **Finish speaking**, correct the transcript if needed, and press **Send**. The answer shows links you can open in your browser. **Esc** closes the overlay and returns focus to the game.

**Ctrl+Shift+V** opens the overlay and starts or stops speaking. **Ctrl+Shift+A** asks for a hint. **Ctrl+Shift+T** asks for a translation. If local voice is unavailable, focus the question box and use Windows **Win+H** dictation.

The **Model** field in the overlay lets you choose a model ID or alias for the current provider. Choices are saved separately for Claude, Codex, and Gemini. Leave the field blank to use Claude Sonnet, the Codex CLI default, or the Gemini model in `config.toml`, respectively. Claude offers `sonnet`, `opus`, and `haiku` suggestions; other model IDs can be typed directly. Changes apply to the next question.

The overlay remembers a separate chat for each game executable while the app stays open. You can edit the detected game title. The **Hints first** option keeps answers brief and reduces spoilers. Uncheck **Screenshot** to ask using text alone. A failed capture blocks a screenshot request until you Retake or choose text only.

Claude is restricted to WebSearch/WebFetch and Codex to live search with file/shell tools disabled for this session. Gemini remains available when configured but currently answers without live web research. Search activity appears in the response status; answers only include links the model supplied, so check a linked guide if precision matters.

## Build prerequisites

Windows 10/11, WebView2, Node.js 22.13+ (or 24+), Rust stable, and Visual Studio C++ Build Tools are needed. The build script runs `npm ci`, builds the Svelte frontend, and builds a portable Rust executable. It keeps the upstream MIT notice. On this PC, Rust and Visual Studio C++ Build Tools were installed during implementation; the voice model is already installed in the app data folder.

The `-WithVoice` build downloads a pinned whisper.cpp v1.8.3 x64 runtime and English base model, checks their SHA-256 hashes, and copies them beside Sage. The standalone voice setup installs the same files under `%APPDATA%\com.aigamecompanion.launcher\voice`. The model is approximately 148 MB. Audio is captured only while recording and a temporary WAV is deleted after transcription. The app does not automatically listen to game audio.

For development, run `npm ci` in `crates/launcher`, then `npm run tauri dev`. Run `npm run check`, `npm run lint`, `npm test`, `npm run test:ui`, and `cargo test --workspace --all-features --locked` before changing the app. The upstream README has additional Windows capture and display-mode notes.

Google AI Mode's consumer UI is not integrated. Its separate desktop app remains an option, while this overlay provides the native Claude/Codex path.
