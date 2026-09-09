# OpenJarvis Voice Assistant Launch Script
# Starts Ollama, the OpenJarvis backend, and the Ultron frontend in three
# separate terminals.
#
# CONFIGURATION — set these environment variables before running, or accept
# the documented defaults:
#
#   OLLAMA_MODELS      Path where Ollama stores model files.
#                      Default: Ollama's own default (~/.ollama/models on
#                               Windows: %USERPROFILE%\.ollama\models)
#
#   HF_HOME            HuggingFace cache root used by Faster-Whisper and
#                      Kokoro model downloads.
#                      Default: %USERPROFILE%\.cache\huggingface
#
#   OPENJARVIS_MODEL   The Ollama model tag to serve.
#                      Default: qwen3.5:4b
#
#   OPENJARVIS_PORT    Port for the OpenJarvis backend API.
#                      Default: 8000
#
#   OPENJARVIS_AGENT   Agent to start (orchestrator, simple, native_react …).
#                      Default: orchestrator
#
#   ULTRON_PATH        Absolute path to the Ultron frontend repository.
#                      There is no default — set this variable before running
#                      if you use the Ultron frontend.
#                      Example: $env:ULTRON_PATH = "C:\Projects\Ultron-OpenJarvis"
#
# Usage:
#   .\start_voice.ps1
#   or set vars inline:
#   $env:OPENJARVIS_MODEL="llama3.2:3b"; .\start_voice.ps1

# ---------------------------------------------------------------------------
# Resolve configuration from environment variables
# ---------------------------------------------------------------------------

$JarvisRoot  = $PSScriptRoot   # always the directory containing this script

$OllamaModels = if ($env:OLLAMA_MODELS)     { $env:OLLAMA_MODELS }
                else                         { "$env:USERPROFILE\.ollama\models" }

$HfHome       = if ($env:HF_HOME)           { $env:HF_HOME }
                else                         { "$env:USERPROFILE\.cache\huggingface" }

$Model        = if ($env:OPENJARVIS_MODEL)  { $env:OPENJARVIS_MODEL }
                else                         { "qwen3.5:4b" }

$Port         = if ($env:OPENJARVIS_PORT)   { $env:OPENJARVIS_PORT }
                else                         { "8000" }

$Agent        = if ($env:OPENJARVIS_AGENT)  { $env:OPENJARVIS_AGENT }
                else                         { "orchestrator" }

$UltronPath   = $env:ULTRON_PATH   # no committed default — must be set by user

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "         OpenJarvis 3-Terminal Launch                " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Jarvis root  : $JarvisRoot"   -ForegroundColor Gray
Write-Host "  Model        : $Model"         -ForegroundColor Gray
Write-Host "  Backend port : $Port"          -ForegroundColor Gray
Write-Host "  Agent        : $Agent"         -ForegroundColor Gray
Write-Host "  OLLAMA_MODELS: $OllamaModels"  -ForegroundColor Gray
Write-Host "  HF_HOME      : $HfHome"        -ForegroundColor Gray
if ($UltronPath) {
    Write-Host "  Ultron path  : $UltronPath" -ForegroundColor Gray
} else {
    Write-Host "  Ultron path  : (not set — Terminal 3 skipped)" -ForegroundColor DarkYellow
}
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Kill any background instances to prevent port conflicts
# ---------------------------------------------------------------------------

Write-Host "Cleaning up existing processes to free ports..." -ForegroundColor Yellow
Stop-Process -Name "ollama app", "ollama" -Force -ErrorAction SilentlyContinue

$existingPid = (Get-NetTCPConnection -LocalPort ([int]$Port) -ErrorAction SilentlyContinue).OwningProcess
if ($existingPid) { Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------------------
# 2. Terminal 1 — Ollama
# ---------------------------------------------------------------------------

Write-Host "Launching Ollama (Terminal 1)..." -ForegroundColor Yellow
$ollamaCmd = "`$env:OLLAMA_MODELS='$OllamaModels'; Write-Host 'Starting Ollama...'; ollama serve"
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $ollamaCmd

Start-Sleep -Seconds 2

# ---------------------------------------------------------------------------
# 3. Terminal 2 — OpenJarvis backend
# ---------------------------------------------------------------------------

Write-Host "Launching OpenJarvis Backend (Terminal 2)..." -ForegroundColor Yellow
$jarvisCmd = "`$env:HF_HOME='$HfHome'; " +
             "`$env:HF_HUB_CACHE='$HfHome\hub'; " +
             "`$env:OLLAMA_MODELS='$OllamaModels'; " +
             "Set-Location '$JarvisRoot'; " +
             "Write-Host 'Starting Jarvis on Port $Port...'; " +
             "uv run jarvis serve --agent $Agent --engine ollama --model $Model --port $Port"
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $jarvisCmd

Start-Sleep -Seconds 2

# ---------------------------------------------------------------------------
# 4. Terminal 3 — Ultron frontend (optional)
# ---------------------------------------------------------------------------

if ($UltronPath) {
    if (Test-Path $UltronPath) {
        Write-Host "Launching Ultron Frontend (Terminal 3)..." -ForegroundColor Yellow
        $ultronCmd = "Set-Location '$UltronPath'; Write-Host 'Starting Ultron UI...'; npm run dev"
        Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $ultronCmd
    } else {
        Write-Host "WARNING: ULTRON_PATH='$UltronPath' does not exist — skipping Terminal 3." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "ULTRON_PATH not set — skipping Ultron frontend (Terminal 3)." -ForegroundColor DarkYellow
    Write-Host "  To enable: `$env:ULTRON_PATH = 'C:\path\to\Ultron-OpenJarvis'; .\start_voice.ps1" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Terminals launched. Check each window for logs." -ForegroundColor Green
Write-Host "  Backend API  : http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Ollama API   : http://localhost:11434" -ForegroundColor Cyan
if ($UltronPath) {
    Write-Host "  Ultron UI    : http://localhost:3000" -ForegroundColor Cyan
}
Write-Host ""
