param(
    [string]$Destination = (Join-Path $env:APPDATA 'com.aigamecompanion.launcher\voice'),
    [switch]$Gpu
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$cache = Join-Path $PSScriptRoot '..\.tools\voice'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function Get-VerifiedFile([string]$Url, [string]$Path, [string]$Hash) {
    if ((Test-Path -LiteralPath $Path) -and (Get-FileHash -LiteralPath $Path).Hash -eq $Hash) { return }
    & curl.exe --location --fail --silent --show-error --retry 3 --output $Path $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
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
$runtimeLicense = Join-Path $cache 'LICENSE-whisper-cpp.txt'
$modelLicense = Join-Path $cache 'LICENSE-whisper-model.txt'
Get-VerifiedFile 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.3/LICENSE' $runtimeLicense 'E562A2DDFAF8280537795AC5ECD34E3012B6582A147EF69BA6A6A5C08C84757D'
Get-VerifiedFile 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE' $modelLicense 'B5D65A59060E68C4FF940E1EDDFA6F94B2D68FDF58ED7F4DD57721C997E35E9D'
Copy-Item -LiteralPath $runtimeLicense,$modelLicense -Destination $Destination -Force
if ($Gpu) {
    $gpuZip = Join-Path $cache 'whisper-cuda-12.4.zip'
    $turbo = Join-Path $cache 'ggml-large-v3-turbo.bin'
    Get-VerifiedFile 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-cublas-12.4.0-bin-x64.zip' $gpuZip 'C12A563333D3C3707BE70754DC0E87C1CB58AA6333A87055BBCF9B524488DFB0'
    Get-VerifiedFile 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin' $turbo '1FC70F774D38EB169993AC391EEA357EF47C88757EF72EE5943879B7E8E2BC69'
    $gpuRuntime = Join-Path $cache 'runtime-cuda'
    Expand-Archive -LiteralPath $gpuZip -DestinationPath $gpuRuntime -Force
    $gpuDestination = Join-Path $Destination 'cuda'
    New-Item -ItemType Directory -Force -Path $gpuDestination | Out-Null
    $gpuCli = Get-ChildItem -LiteralPath $gpuRuntime -Filter 'whisper-cli.exe' -Recurse | Select-Object -First 1
    if (!$gpuCli) { throw 'CUDA archive does not contain whisper-cli.exe.' }
    Copy-Item -LiteralPath $gpuCli.FullName -Destination $gpuDestination -Force
    Get-ChildItem -LiteralPath $gpuCli.DirectoryName -Filter '*.dll' | Copy-Item -Destination $gpuDestination -Force
    Copy-Item -LiteralPath $turbo -Destination (Join-Path $Destination 'ggml-large-v3-turbo.bin') -Force
    Write-Output 'Whisper large-v3-turbo with NVIDIA CUDA is installed; Whisper base remains available as the CPU fallback.'
}
Write-Output "Local multilingual voice is ready in $Destination. Audio is transcribed on this PC."
