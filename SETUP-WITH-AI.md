# Prompt for an AI assistant to set up Sage

Copy the prompt below into a coding assistant that can run commands on **your Windows PC**. Run it from a clone of this repository on the `feature/universal-voice-search` branch. You will still need to complete your own Claude/Codex sign-in or enter a Gemini key in Sage's Settings.

```text
Set up this repository's Sage game overlay on my Windows 10/11 x64 PC. You have permission to install missing build prerequisites from official vendor sources and to run the repository's build and voice setup scripts. Read README-FORK.md, scripts/build-windows.ps1, scripts/setup-voice.ps1, and LICENSE before changing anything.

1. Check that this checkout is on feature/universal-voice-search (or a newer branch containing Sage). Check Git, Node 22.13+ or 24+, npm, stable Rust/MSVC, Visual Studio Desktop development with C++ and Windows SDK, and WebView2. Install only missing prerequisites. Reopen the shell after PATH changes. Do not make unrelated system or repository changes.
2. Ask which existing AI provider I want: Claude Code, Codex CLI, or Gemini. Detect installed CLIs and help me install one if needed. Let me complete account sign-in myself. Do not ask me to paste tokens, passwords, or an API key into chat. If I choose Gemini, show me where to enter its key in Sage Settings → Providers; do not write it to config.toml.
3. From the repository root, run the Windows build with voice: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1 -WithVoice. If I want higher transcription accuracy and have a suitable NVIDIA GPU with free VRAM, use -GpuVoice instead to install Whisper large-v3-turbo and CUDA with a base-model CPU fallback; explain the roughly 2 GB extra download first. Do not bypass the voice download hash checks. If Sage.exe is running, close it before rebuilding. Preserve the LICENSE and original-author attribution.
4. Verify out\Sage\Sage.exe and out\Sage\voice\ggml-base.bin exist. For GPU voice also verify voice\cuda\whisper-cli.exe and voice\ggml-large-v3-turbo.bin, then confirm the reported engine after transcription. Launch Sage. Check Settings → Providers, use Re-check CLIs if needed, and test Ctrl+Shift+G over a windowed/borderless game. Test Ctrl+Shift+V start/stop, select the correct Speech language, check the transcript, and send with Enter. If you cannot test a step because my account or game requires my interaction, say exactly which step and what I should do.
5. Report the executable path, detected provider, voice status, tests performed, and any remaining setup issue. Never commit secrets or push changes to GitHub unless I separately ask you to.
```

Sage is based on [Wintersta7e's AI Game Companion](https://github.com/Wintersta7e/AiGameCompanion) and retains the original [MIT license](LICENSE).
