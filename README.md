<div align="center">
  <img alt="OpenJarvis" src="assets/OpenJarvis_Horizontal_Logo.png" width="400">

  <p><i>Personal AI, On Personal Devices.</i></p>

  <p>
    <a href="https://arxiv.org/abs/2605.17172"><img src="https://img.shields.io/badge/arXiv-2605.17172-b31b1b.svg" alt="arXiv"></a>
    <a href="https://openjarvis.stanford.edu/"><img src="https://img.shields.io/badge/project-OpenJarvis-blue" alt="Project"></a>
    <a href="https://open-jarvis.github.io/OpenJarvis/"><img src="https://img.shields.io/badge/docs-mkdocs-blue" alt="Docs"></a>
    <img src="https://img.shields.io/badge/python-%3E%3D3.10-blue" alt="Python">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License">
    <a href="https://discord.gg/CMVBmDQ5Fj"><img src="https://img.shields.io/badge/discord-join-7289da?logo=discord&logoColor=white" alt="Discord"></a>
    <a href="https://x.com/OpenJarvisAI"><img src="https://img.shields.io/badge/X-@OpenJarvisAI-black?logo=x&logoColor=white" alt="X / Twitter"></a>
  </p>
</div>

---

<div align="center">
  <img alt="OpenJarvis demo reel" src="assets/openjarvis_demo_reel.webp" width="75%">
</div>

---

> **[Documentation](https://open-jarvis.github.io/OpenJarvis/)**
>
> **[Project Site](https://openjarvis.stanford.edu/)**
>
> **[Paper](https://arxiv.org/abs/2605.17172)**
>
> **[Leaderboard](https://open-jarvis.github.io/OpenJarvis/leaderboard/)**
>
> **[Roadmap](https://open-jarvis.github.io/OpenJarvis/development/roadmap/)**

## Why OpenJarvis?

Personal AI agents are exploding in popularity, but nearly all of them still route intelligence through cloud APIs. Your "personal" AI continues to depend on someone else's server. At the same time, our [Intelligence Per Watt](https://www.intelligence-per-watt.ai/) research showed that local language models already handle 88.7% of single-turn chat and reasoning queries, with intelligence efficiency improving 5.3× from 2023 to 2025. The models and hardware are increasingly ready. What has been missing is the software stack to make local-first personal AI practical.

OpenJarvis is that stack. It is a framework for local-first personal AI, built around three core ideas: shared primitives for building on-device agents; evaluations that treat energy, FLOPs, latency, and dollar cost as first-class constraints alongside accuracy; and a learning loop that improves models using local trace data. The goal is simple: make it possible to build personal AI agents that run locally by default, calling the cloud only when truly necessary. OpenJarvis aims to be both a research platform and a production foundation for local AI, in the spirit of PyTorch.

## Installation

Pick your platform and run one command. Each installer handles [uv](https://docs.astral.sh/uv/), the Python venv, Ollama, and a starter model — about 3 minutes on broadband.

| Platform | One-liner |
|---|---|
| **macOS · Linux · WSL2** | `curl -fsSL https://open-jarvis.github.io/OpenJarvis/install.sh \| bash` |
| **Native Windows** | `irm https://open-jarvis.github.io/OpenJarvis/install.ps1 \| iex` |
| **Desktop GUI** | Download `.exe` / `.dmg` / `.deb` / `.rpm` / `.AppImage` from the [latest release](https://github.com/open-jarvis/OpenJarvis/releases) |

Then `jarvis` to start. The Rust extension and larger models continue downloading in the background; `jarvis doctor` shows status.

Platform-specific notes (WSL2 setup, native-Windows scheduled-task service, desktop prerequisites, manual / contributor install): see the [installation docs](https://open-jarvis.github.io/OpenJarvis/getting-started/install/).

## Quick Start

```bash
jarvis                          # start chatting (default: chat-simple)
jarvis init --preset <name>     # switch to a starter config
```

> Prefix `jarvis ...` with `uv run`, or `source .venv/bin/activate` first.

| Preset | What it does |
|---|---|
| `morning-digest-mac` / `morning-digest-linux` / `morning-digest-minimal` | Spoken daily briefing from email, calendar, health, news |
| `deep-research` | Multi-hop research across indexed docs with citations |
| `code-assistant` | Agent with code execution, file I/O, and shell access |
| `scheduled-monitor` | Stateful agent on a schedule with memory |
| `chat-simple` | Lightweight conversation, no tools |

Example:

```bash
jarvis init --preset morning-digest-mac
jarvis connect gdrive          # one OAuth covers Gmail / Calendar / Tasks
jarvis digest --fresh          # generate and play your first briefing
```

Per-preset deep dives: [morning digest](https://open-jarvis.github.io/OpenJarvis/user-guide/morning-digest/) · [deep research](https://open-jarvis.github.io/OpenJarvis/user-guide/deep-research/) · [code assistant](https://open-jarvis.github.io/OpenJarvis/user-guide/code-assistant/) · [scheduled monitor](https://open-jarvis.github.io/OpenJarvis/user-guide/scheduled-monitor/) · [chat simple](https://open-jarvis.github.io/OpenJarvis/user-guide/chat-simple/) · or the full [quickstart guide](https://open-jarvis.github.io/OpenJarvis/getting-started/quickstart/).

### Skills

Skills teach agents how to better use tools and improve their reasoning. Every skill is a tool — agents discover them from a catalog and invoke them on demand.

```bash
# Install skills from public sources
jarvis skill install hermes:arxiv
jarvis skill sync hermes --category research

# Use skills with any agent
jarvis ask "Use the code-explainer skill to explain this Python code: for i in range(5): print(i*2)"

# Optimize skills from your trace history
jarvis optimize skills --policy dspy

# Benchmark the impact
jarvis bench skills --max-samples 5 --seeds 42
```

Import from [Hermes Agent](https://github.com/NousResearch/hermes-agent) (~150 skills), [OpenClaw](https://github.com/openclaw/skills) (~13,700 community skills), or any GitHub repo. Skills follow the [agentskills.io](https://agentskills.io/specification) open standard.

See the [Skills User Guide](https://open-jarvis.github.io/OpenJarvis/user-guide/skills/) and [Skills Tutorial](https://open-jarvis.github.io/OpenJarvis/tutorials/skills-workflow/) for details.

### Built-in Agents

OpenJarvis ships with eight built-in agents across three execution modes (on-demand, scheduled, continuous):

| Agent | Type | What it does |
|-------|------|-------------|
| `morning_digest` | Scheduled | Daily briefing from email, calendar, health, news — with TTS audio |
| `deep_research` | On-demand | Multi-hop research with citations across web and local docs |
| `monitor_operative` | Continuous | Long-horizon monitoring with memory, compression, and retrieval |
| `orchestrator` | On-demand | Multi-turn reasoning with automatic tool selection |
| `native_react` | On-demand | ReAct (Thought-Action-Observation) loop agent |
| `operative` | Continuous | Persistent autonomous agent with state management |
| `native_openhands` | On-demand | CodeAct — generates and executes Python code |
| `simple` | On-demand | Single-turn chat, no tools |

See the [User Guide](https://open-jarvis.github.io/OpenJarvis/user-guide/morning-digest/) and [Tutorials](https://open-jarvis.github.io/OpenJarvis/tutorials/) for detailed setup instructions.

Full documentation — including Docker deployment, cloud engines, development setup, and tutorials — at **[open-jarvis.github.io/OpenJarvis](https://open-jarvis.github.io/OpenJarvis/)**.

---

## Local Windows Voice Mode

> **This section documents the extended local Windows setup** — voice interaction, Windows desktop automation, and the 3-terminal launcher. These features run natively on Windows and do **not** apply to Docker/Linux deployments.

### What This Mode Adds

| Feature | Description |
|---|---|
| **Voice Input** | Faster-Whisper (local STT — no cloud) transcribes microphone audio |
| **Voice Output** | Kokoro TTS (local, open-source) synthesises spoken responses |
| **Desktop Automation** | `windows_desktop_action` tool opens/closes apps, folders, URLs via an allowlist |
| **Voice UI** | `VoicePage` in the built-in frontend with VAD auto-stop and autonomous loop |
| **3-Terminal Launcher** | `start_voice.ps1` starts Ollama + OpenJarvis + optional Ultron frontend |

### Prerequisites

| Requirement | Notes |
|---|---|
| Windows 10/11 | Desktop automation and audio capture require Windows |
| [Ollama](https://ollama.com/) installed | `ollama pull qwen3.5:4b` (or your preferred model) |
| Python ≥ 3.10, [uv](https://docs.astral.sh/uv/) | `pip install uv` or the one-liner installer |
| Speech extras installed | `uv sync --extra speech` (installs Faster-Whisper + Kokoro + sounddevice) |

### Quick Start

```powershell
# 1. Clone and install with speech support
git clone https://github.com/<your-fork>/OpenJarvis.git
cd OpenJarvis
uv sync --extra speech

# 2. Pull your model (first time only — ~2 GB)
ollama pull qwen3.5:4b

# 3. (Optional) set non-default paths
$env:OLLAMA_MODELS  = "D:\MyModels"          # if you store models elsewhere
$env:HF_HOME        = "D:\HuggingFaceCache"  # if you store HF models elsewhere
$env:OPENJARVIS_MODEL = "qwen3.5:4b"         # model tag (default: qwen3.5:4b)
$env:ULTRON_PATH    = "C:\Projects\Ultron-OpenJarvis"  # if using Ultron frontend

# 4. Launch everything
.\start_voice.ps1
```

`start_voice.ps1` opens three PowerShell terminals:
1. **Ollama** — local inference server on port 11434
2. **OpenJarvis backend** — FastAPI on port 8000 (`orchestrator` agent, Ollama engine)
3. **Ultron frontend** — React dev server (only if `ULTRON_PATH` is set)

### Environment Variables (Local Dev)

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_MODELS` | `%USERPROFILE%\.ollama\models` | Where Ollama stores model weights |
| `HF_HOME` | `%USERPROFILE%\.cache\huggingface` | HuggingFace / Faster-Whisper cache |
| `OPENJARVIS_MODEL` | `qwen3.5:4b` | Ollama model tag |
| `OPENJARVIS_PORT` | `8000` | Backend API port |
| `OPENJARVIS_AGENT` | `orchestrator` | Agent type to start |
| `ULTRON_PATH` | *(unset — Terminal 3 skipped)* | Path to the Ultron frontend repo |
| `VITE_OPENJARVIS_API_KEY` | *(empty)* | API key for the frontend; set in `frontend/.env.local` |

### Voice Pipeline

The voice pipeline runs **entirely locally** — no cloud APIs required:

```
Microphone → Faster-Whisper (STT) → OpenJarvis orchestrator
           → Kokoro TTS (synthesis) → Speaker
```

- **STT:** [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) uses CTranslate2 for fast local transcription. Models download automatically on first use (~150 MB for `base`).
- **TTS:** [Kokoro](https://github.com/hexgrad/kokoro) is a fully open-source TTS library. Supports English, Mandarin, Japanese, French, Italian, Portuguese, Hindi, Spanish. Default voice: `af_heart`.
- **VAD:** The frontend uses the Web Audio API AnalyserNode for voice-activity detection — recording stops automatically after silence.

### Windows Desktop Automation

The `windows_desktop_action` tool lets the orchestrator control the Windows desktop through a strict allowlist:

```
"Open Chrome"          → open_application: chrome
"Open Downloads"       → open_folder: downloads
"Search for NVIDIA"    → search_web: NVIDIA
"Open github.com"      → open_url: https://github.com
"Close Spotify"        → close_application: spotify
```

**Security model:** only explicitly listed applications can be launched or closed. `cmd`, `powershell`, and `terminal` are blocked. Only `https://` URLs are accepted.

> **Note:** `windows_desktop_action` checks `sys.platform` at runtime and returns a graceful error on non-Windows systems — it will not crash a Linux/Docker deployment, it simply won't perform any actions.

### Troubleshooting

| Problem | Fix |
|---|---|
| `faster-whisper not installed` | `uv sync --extra speech` |
| `kokoro package not installed` | `uv sync --extra speech` |
| Kokoro Mandarin/Japanese fails | `pip install "misaki[zh]"` or `pip install "misaki[ja]"` |
| Port 8000 already in use | `start_voice.ps1` kills the process automatically; or run manually: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess` |
| Ollama not found | Install from [ollama.com](https://ollama.com/) and ensure it's on PATH |
| Browser blocks mic / audio | Click the **"Start Jarvis"** button after granting microphone permission |

---

## Docker Deployment

OpenJarvis ships with a complete Docker setup in [`deploy/docker/`](deploy/docker/). The built image bundles the FastAPI backend and the built frontend SPA.

### What Works in Docker

| Feature | Docker (Linux) |
|---|---|
| OpenJarvis API server | ✅ Full support |
| Built-in chat frontend | ✅ Served from `/` |
| Ollama inference (via compose) | ✅ Included as a service |
| All text-based agents | ✅ Full support |
| Memory / vector search | ✅ Full support |

### What Does NOT Work in Docker

| Feature | Reason |
|---|---|
| Voice input (Faster-Whisper) | Requires physical microphone — no audio hardware in containers |
| Voice output (Kokoro TTS) | Requires audio output device |
| Windows desktop automation | Windows-only syscalls; tool is disabled on Linux |
| `start_voice.ps1` | PowerShell Windows script |

### CPU Quick Start

```bash
# 1. Copy and configure environment
cp deploy/docker/.env.example deploy/docker/.env
# Edit deploy/docker/.env — set OPENJARVIS_API_KEY at minimum

# 2. Start (Ollama + OpenJarvis backend + built-in frontend)
docker compose -f deploy/docker/docker-compose.yml up

# Or from the repo root (convenience alias):
docker compose up

# 3. Pull your model inside the Ollama container
docker exec -it openjarvis-ollama-1 ollama pull qwen3.5:4b

# 4. Open the UI
open http://localhost:8000
```

### GPU (NVIDIA)

```bash
# Requires: NVIDIA Container Toolkit installed on the host
docker compose \
  -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.gpu.nvidia.yml \
  up
```

### GPU (AMD ROCm)

```bash
docker compose \
  -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.gpu.rocm.yml \
  up
```

### Using Host Ollama Instead of the Compose Service

If Ollama is already running on your host machine, remove the `ollama` service and point the backend at the host:

```bash
# In deploy/docker/.env:
OLLAMA_HOST=http://host.docker.internal:11434

# Then start only the jarvis service:
docker compose -f deploy/docker/docker-compose.yml up jarvis
```

### Environment Variables (Docker)

See [`deploy/docker/.env.example`](deploy/docker/.env.example) for the full reference. Key variables:

| Variable | Required | Description |
|---|---|---|
| `OPENJARVIS_API_KEY` | **Yes** | Bearer token for all API requests |
| `OPENJARVIS_ENGINE_DEFAULT` | No | Inference engine (default: `ollama`) |
| `OLLAMA_HOST` | No | Ollama URL (default: `http://ollama:11434`) |
| `OLLAMA_MODEL` | No | Model tag (default: `qwen3.5:4b`) |

### Advanced: Speech in Docker (Optional)

Voice support in Docker is possible but is **not part of the default image** because it requires torch (~2 GB) and audio libraries. To enable it:

1. Build with `--extra speech` added to the `uv export` step in the Dockerfile
2. Use the GPU image (`Dockerfile.gpu`) for reasonable TTS performance
3. Mount an audio device into the container (`--device /dev/snd`)

This is an advanced configuration. For most use cases, run voice features on Windows locally and use Docker for the API server only.

---

## Community

- **GitHub:** [github.com/open-jarvis/OpenJarvis](https://github.com/open-jarvis/OpenJarvis)
- **Discord:** [discord.gg/CMVBmDQ5Fj](https://discord.gg/CMVBmDQ5Fj)
- **X / Twitter:** [@OpenJarvisAI](https://x.com/OpenJarvisAI)
- **Docs:** [open-jarvis.github.io/OpenJarvis](https://open-jarvis.github.io/OpenJarvis/)

## Contributing

We welcome contributions! See the [Contributing Guide](CONTRIBUTING.md) for incentives, contribution types, and the PR process.

Quick start for contributors:

```bash
git clone https://github.com/open-jarvis/OpenJarvis.git
cd OpenJarvis
uv sync --extra dev
uv run pre-commit install
uv run pytest tests/ -v
```

Browse the [Roadmap](https://open-jarvis.github.io/OpenJarvis/development/roadmap/) for areas where help is needed. Comment **"take"** on any issue to get auto-assigned.

## About

OpenJarvis is part of [Intelligence Per Watt](https://www.intelligence-per-watt.ai/), a research initiative studying the intelligence efficiency of AI systems. The project is developed at [Hazy Research](https://hazyresearch.stanford.edu/) and the [Scaling Intelligence Lab](https://scalingintelligence.stanford.edu/) at [Stanford SAIL](https://ai.stanford.edu/).

## Sponsors

<p>
  <a href="https://www.laude.org/">Laude Institute</a> &bull;
  <a href="https://datascience.stanford.edu/marlowe">Stanford Marlowe</a> &bull;
  <a href="https://cloud.google.com/">Google Cloud Platform</a> &bull;
  <a href="https://lambda.ai/">Lambda Labs</a> &bull;
  <a href="https://ollama.com/">Ollama</a> &bull;
  <a href="https://research.ibm.com/">IBM Research</a> &bull;
  <a href="https://hai.stanford.edu/">Stanford HAI</a>
</p>

## Citation
```bibtex
@misc{saadfalcon2026openjarvispersonalaipersonal,
      title={OpenJarvis: Personal AI, On Personal Devices}, 
      author={Jon Saad-Falcon and Avanika Narayan and Robby Manihani and Tanvir Bhathal and Herumb Shandilya and Hakki Orhun Akengin and Gabriel Bo and Andrew Park and Matthew Hart and Caia Costello and Chuan Li and Christopher Ré and Azalia Mirhoseini},
      year={2026},
      eprint={2605.17172},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/2605.17172}, 
}
```

## License

[Apache 2.0](LICENSE)
