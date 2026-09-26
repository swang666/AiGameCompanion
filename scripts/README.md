# scripts

| Script | What it does | Run |
|---|---|---|
| `build-windows.ps1` | Native Windows release build of Sage. Builds the frontend and Rust app, then copies `Sage.exe`, the MIT license, setup guides, and the optional Gemini config example to `out/Sage/`. Add `-WithVoice` to bundle local transcription. See [manual setup](../README-FORK.md). | `& .\scripts\build-windows.ps1 -WithVoice` from the repository root |
| `setup-voice.ps1` | Downloads the pinned multilingual whisper.cpp runtime and base model, verifies SHA-256 hashes, and installs them to this PC's app data directory or the supplied `-Destination`. Add `-Gpu` for large-v3-turbo and NVIDIA CUDA, retaining the base CPU fallback. `build-windows.ps1 -GpuVoice` bundles the same GPU setup. | `& .\scripts\setup-voice.ps1 -Gpu -Destination .\out\Sage\voice` from the repository root |
| `build.sh` | Release build of the launcher (vite build + `cargo xwin build`), copies `launcher.exe` + `config.example.toml` to `release/`. Also strips the build host's paths out of the binary -- from Rust via `--remap-path-prefix`, and from the C dependencies via `TARGET_CFLAGS_<target>`, which must repeat cargo-xwin's sysroot includes because aws-lc-sys replaces that variable instead of appending to it. | `./scripts/build.sh` |
| `ci-check.sh` | Mirror the GitHub CI gate locally before pushing: `cargo fmt --check`, clippy (`--all-targets`), test, eslint, prettier `--check`, svelte-check (`--fail-on-warnings`), vite build, `npm audit`, cargo-deny, gitleaks. Run it after `cargo fmt` too. | `./scripts/ci-check.sh` |
