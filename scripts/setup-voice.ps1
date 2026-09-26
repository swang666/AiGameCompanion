param([string]$Destination = (Join-Path $env:APPDATA 'com.aigamecompanion.launcher\voice'))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$cache = Join-Path $PSScriptRoot '..\.tools\voice'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function Get-VerifiedFile([string]$Url, [string]$Path, [string]$Hash) {
    if ((Test-Path -LiteralPath $Path) -and (Get-FileHash -LiteralPath $Path).Hash -eq $Hash) { return }
    Invoke-WebRequest -Uri $Url -OutFile $Path
    if ((Get-FileHash -LiteralPath $Path).Hash -ne $Hash) { throw "Downloaded file failed verification: $Path" }
}
$zip = Join-Path $cache 'whisper.zip'
$model = Join-Path $cache 'ggml-base.bin'
Get-VerifiedFile 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip' $zip 'D824B1E37599F882B396E73F1EE0BFD5D0529F700314C48311DCBD00B803321D'
Get-VerifiedFile 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' $model '60ED5BC3DD14EEA856493D334349B405782DDCAF0028D4B5DF4088345FBA2EFE'
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $cache 'runtime') -Force
foreach ($name in @('whisper-cli.exe','whisper.dll','ggml.dll','ggml-base.dll','ggml-cpu.dll')) {
    Copy-Item -LiteralPath (Join-Path $cache "runtime\Release\$name") -Destination $Destination -Force
}
Copy-Item -LiteralPath $model -Destination (Join-Path $Destination 'ggml-base.bin') -Force
Write-Output "Local multilingual voice is ready in $Destination. Audio is transcribed on this PC."
