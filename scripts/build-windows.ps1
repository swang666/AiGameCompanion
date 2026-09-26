param([switch]$WithVoice, [switch]$GpuVoice)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
if (!(Test-Path -LiteralPath $cargo)) { throw 'Install Rust and the Visual Studio C++ build tools first. See README-FORK.md.' }
Push-Location (Join-Path $root 'crates\launcher')
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
Push-Location $root
try {
    & $cargo build --release --features custom-protocol --locked
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
    $output = Join-Path $root 'out\Sage'
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'target\release\launcher.exe') -Destination (Join-Path $output 'Sage.exe') -Force
    Copy-Item -LiteralPath (Join-Path $root 'LICENSE'),(Join-Path $root 'README-FORK.md'),(Join-Path $root 'SETUP-WITH-AI.md'),(Join-Path $root 'config.example.toml') -Destination $output -Force
    if ($WithVoice -or $GpuVoice) { & (Join-Path $PSScriptRoot 'setup-voice.ps1') -Destination (Join-Path $output 'voice') -Gpu:$GpuVoice }
    Write-Output "Built: $output\Sage.exe"
} finally { Pop-Location }
