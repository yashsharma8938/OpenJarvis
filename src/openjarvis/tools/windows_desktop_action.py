"""Windows desktop action tool — safe, allowlisted desktop control for Windows.

The LLM produces a structured action rather than arbitrary shell commands.
Only explicitly enumerated actions are permitted.  Destructive operations
(file deletion, registry edits, shutdown/restart, arbitrary executables) are
NOT available through this tool.

Example inputs:
    {"action": "open_application", "target": "chrome"}
    {"action": "open_folder", "target": "downloads"}
    {"action": "open_url", "target": "https://youtube.com"}
    {"action": "close_application", "target": "chrome"}
    {"action": "search_web", "query": "NVIDIA news"}
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

# ---------------------------------------------------------------------------
# Application allowlist — maps friendly name → Windows executable / path.
# Only applications in this dict can be launched or closed.
# ---------------------------------------------------------------------------

_APP_LAUNCH_MAP: dict[str, list[str]] = {
    # Browsers
    "chrome": [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ],
    "edge": [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ],
    "firefox": [
        r"C:\Program Files\Mozilla Firefox\firefox.exe",
        r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
    ],
    "whatsapp": [
        "whatsapp:",
        os.path.expandvars(r"%LOCALAPPDATA%\WhatsApp\WhatsApp.exe"),
    ],
    "teams": [
        "msteams:",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Teams\current\Teams.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Teams\Update.exe") + " --processStart \"Teams.exe\"",
    ],
    # Editors / IDEs
    "vscode": [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"),
        r"C:\Program Files\Microsoft VS Code\Code.exe",
    ],
    "vs code": [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"),
    ],
    "notepad": ["notepad.exe"],
    "notepad++": [
        r"C:\Program Files\Notepad++\notepad++.exe",
        r"C:\Program Files (x86)\Notepad++\notepad++.exe",
    ],
    # Media
    "spotify": [
        os.path.expandvars(r"%APPDATA%\Spotify\Spotify.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WindowsApps\Spotify.exe"),
    ],
    "vlc": [
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
    ],
    # System
    "explorer": ["explorer.exe"],
    "calculator": ["calc.exe"],
    "paint": ["mspaint.exe"],
    "wordpad": ["wordpad.exe"],
    "task manager": ["taskmgr.exe"],
    "control panel": ["control.exe"],
    "settings": ["ms-settings:"],  # handled via start
    "powershell": [],  # BLOCKED intentionally
    "cmd": [],         # BLOCKED intentionally
    "terminal": [],    # BLOCKED intentionally
}

# Friendly alias normalization
_APP_ALIASES: dict[str, str] = {
    "google chrome": "chrome",
    "chromium": "chrome",
    "microsoft edge": "edge",
    "visual studio code": "vscode",
    "code": "vscode",
    "calc": "calculator",
    "mspaint": "paint",
    "microsoft teams": "teams",
    "cmd": "",          # explicitly blocked
    "powershell": "",   # explicitly blocked
    "terminal": "",     # explicitly blocked
    "cmd.exe": "",
    "powershell.exe": "",
}

# ---------------------------------------------------------------------------
# Folder allowlist — maps friendly name → known Windows special folder.
# ---------------------------------------------------------------------------

_FOLDER_MAP: dict[str, Path] = {
    "downloads": Path.home() / "Downloads",
    "desktop": Path.home() / "Desktop",
    "documents": Path.home() / "Documents",
    "pictures": Path.home() / "Pictures",
    "music": Path.home() / "Music",
    "videos": Path.home() / "Videos",
    "home": Path.home(),
}

# ---------------------------------------------------------------------------
# URL allowlist — open_url accepts any HTTPS URL; validate scheme only.
# ---------------------------------------------------------------------------

_URL_SHORTCUTS: dict[str, str] = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "gmail": "https://mail.google.com",
    "github": "https://www.github.com",
    "twitter": "https://www.twitter.com",
    "x": "https://www.x.com",
    "reddit": "https://www.reddit.com",
    "wikipedia": "https://www.wikipedia.org",
}

# Default web search URL template
_WEB_SEARCH_URL = "https://www.google.com/search?q={query}"


def _resolve_app_path(name: str) -> str | None:
    """Resolve a friendly app name to an existing executable path."""
    normalized = name.strip().lower()
    # Alias lookup
    normalized = _APP_ALIASES.get(normalized, normalized)
    if not normalized:
        return None  # blocked

    candidates = _APP_LAUNCH_MAP.get(normalized, [])
    if not candidates:
        # Try partial match
        for key, paths in _APP_LAUNCH_MAP.items():
            if normalized in key or key in normalized:
                candidates = paths
                break

    for path in candidates:
        path_obj = Path(path)
        # Simple names (notepad.exe, calc.exe) are resolved via PATH
        if not path_obj.is_absolute() or path_obj.exists():
            return str(path_obj)
    return None


def _launch_app(name: str) -> ToolResult:
    """Launch an application from the allowlist."""
    exe = _resolve_app_path(name)
    if exe is None:
        norm = name.strip().lower()
        blocked = {"cmd", "powershell", "terminal", "cmd.exe", "powershell.exe"}
        if norm in blocked or _APP_ALIASES.get(norm) == "":
            return ToolResult(
                tool_name="windows_desktop_action",
                content=f"'{name}' is blocked for security reasons.",
                success=False,
            )
        return ToolResult(
            tool_name="windows_desktop_action",
            content=(
                f"Application '{name}' is not in the approved list. "
                f"Available: {', '.join(k for k in _APP_LAUNCH_MAP if _APP_LAUNCH_MAP[k])}."
            ),
            success=False,
        )
    try:
        if exe.startswith(("ms-settings:", "whatsapp:", "msteams:")):
            subprocess.Popen(f"start {exe}", shell=True)
        elif "--processStart" in exe:
            subprocess.Popen(exe, shell=True)
        else:
            subprocess.Popen([exe], shell=False)
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Launched {name}.",
            success=True,
            metadata={"action": "open_application", "target": name, "exe": exe},
        )
    except Exception as exc:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Failed to launch '{name}': {exc}",
            success=False,
        )


def _close_app(name: str) -> ToolResult:
    """Close an application by process name from the allowlist."""
    normalized = name.strip().lower()
    normalized = _APP_ALIASES.get(normalized, normalized)
    if not normalized:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Closing '{name}' is not permitted.",
            success=False,
        )
    if normalized not in _APP_LAUNCH_MAP:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Application '{name}' is not in the approved list.",
            success=False,
        )
    # Map friendly names to process names for taskkill
    _PROC_MAP = {
        "chrome": "chrome.exe",
        "edge": "msedge.exe",
        "firefox": "firefox.exe",
        "vscode": "Code.exe",
        "vs code": "Code.exe",
        "notepad": "notepad.exe",
        "spotify": "Spotify.exe",
        "vlc": "vlc.exe",
        "calculator": "calc.exe",
        "paint": "mspaint.exe",
        "whatsapp": "WhatsApp.exe",
        "teams": "ms-teams.exe",
    }
    proc = _PROC_MAP.get(normalized)
    if not proc:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Don't know the process name for '{name}'; can't close it safely.",
            success=False,
        )
    try:
        result = subprocess.run(
            ["taskkill", "/F", "/IM", proc],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return ToolResult(
                tool_name="windows_desktop_action",
                content=f"Closed {name}.",
                success=True,
                metadata={"action": "close_application", "target": name},
            )
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"{name} is not running or could not be closed.",
            success=False,
        )
    except Exception as exc:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Failed to close '{name}': {exc}",
            success=False,
        )


def _open_folder(name: str) -> ToolResult:
    """Open a known Windows folder in Explorer."""
    normalized = name.strip().lower()
    folder = _FOLDER_MAP.get(normalized)
    if folder is None:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=(
                f"Folder '{name}' is not in the approved list. "
                f"Available: {', '.join(_FOLDER_MAP.keys())}."
            ),
            success=False,
        )
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.Popen(["explorer.exe", str(folder)], shell=False)
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Opened {name} folder ({folder}).",
            success=True,
            metadata={"action": "open_folder", "target": name, "path": str(folder)},
        )
    except Exception as exc:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Failed to open folder '{name}': {exc}",
            success=False,
        )


def _open_url(target: str) -> ToolResult:
    """Open a URL or URL shortcut in the default browser."""
    # Resolve shortcut
    normalized = target.strip().lower()
    url = _URL_SHORTCUTS.get(normalized, target.strip())
    # Validate scheme — only http/https allowed
    if not (url.startswith("https://") or url.startswith("http://")):
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Only http/https URLs are allowed. Got: {url!r}",
            success=False,
        )
    try:
        import webbrowser
        webbrowser.open(url)
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Opened {url} in browser.",
            success=True,
            metadata={"action": "open_url", "url": url},
        )
    except Exception as exc:
        return ToolResult(
            tool_name="windows_desktop_action",
            content=f"Failed to open URL: {exc}",
            success=False,
        )


def _search_web(query: str) -> ToolResult:
    """Open a web search in the default browser."""
    if not query.strip():
        return ToolResult(
            tool_name="windows_desktop_action",
            content="No search query provided.",
            success=False,
        )
    import urllib.parse
    url = _WEB_SEARCH_URL.format(query=urllib.parse.quote_plus(query.strip()))
    return _open_url(url)


@ToolRegistry.register("windows_desktop_action")
class WindowsDesktopActionTool(BaseTool):
    """Execute safe, allowlisted Windows desktop actions.

    The LLM provides a structured action rather than arbitrary shell commands.
    Only explicitly approved operations are permitted.

    Supported actions:
    - open_application: Launch an approved application (chrome, vscode, notepad,
      spotify, explorer, calculator, paint, edge, firefox, vlc)
    - close_application: Close an approved application by name
    - open_folder: Open a known user folder (downloads, desktop, documents,
      pictures, music, videos, home)
    - open_url: Open an https:// URL or named shortcut (youtube, google, github)
      in the default browser
    - search_web: Search Google for a query in the default browser
    """

    tool_id = "windows_desktop_action"
    is_local = True

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="windows_desktop_action",
            description=(
                "Execute a safe Windows desktop action. Use this when the user asks to "
                "open/launch an application, open a folder, open a URL, close an application, "
                "or search the web. Do NOT use shell_exec for these tasks. "
                "Supported actions: open_application (chrome, vscode, notepad, spotify, "
                "explorer, calculator, paint, edge, firefox, vlc), "
                "close_application (same apps), "
                "open_folder (downloads, desktop, documents, pictures, music, videos, home), "
                "open_url (any https URL or shortcut: youtube, google, github, etc.), "
                "search_web (web search query)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "open_application",
                            "close_application",
                            "open_folder",
                            "open_url",
                            "search_web",
                            "show_desktop",
                        ],
                        "description": (
                            "The desktop action to perform. "
                            "open_application: launch an app. "
                            "close_application: kill an app process. "
                            "open_folder: open a folder in Explorer. "
                            "open_url: open a URL in the browser. "
                            "search_web: search Google. "
                            "show_desktop: minimize all windows."
                        ),
                    },
                    "target": {
                        "type": "string",
                        "description": (
                            "For open/close_application: app name (chrome, vscode, notepad, "
                            "spotify, explorer, calculator, paint, edge, firefox, vlc). "
                            "For open_folder: folder name (downloads, desktop, documents, "
                            "pictures, music, videos, home). "
                            "For open_url: full https URL or shortcut (youtube, google, github)."
                        ),
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query (for search_web action only).",
                    },
                },
                "required": ["action"],
            },
            category="system",
            timeout_seconds=15.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        # Only available on Windows
        if sys.platform != "win32":
            return ToolResult(
                tool_name="windows_desktop_action",
                content="windows_desktop_action is only available on Windows.",
                success=False,
            )

        action = params.get("action", "").strip().lower()
        target = params.get("target", "").strip()
        query = params.get("query", "").strip()

        if action == "open_application":
            if not target:
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content="'target' is required for open_application.",
                    success=False,
                )
            return _launch_app(target)

        elif action == "close_application":
            if not target:
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content="'target' is required for close_application.",
                    success=False,
                )
            return _close_app(target)

        elif action == "open_folder":
            if not target:
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content="'target' is required for open_folder.",
                    success=False,
                )
            return _open_folder(target)

        elif action == "open_url":
            if not target:
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content="'target' (URL or shortcut) is required for open_url.",
                    success=False,
                )
            return _open_url(target)

        elif action == "search_web":
            q = query or target
            if not q:
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content="'query' is required for search_web.",
                    success=False,
                )
            return _search_web(q)

        elif action == "show_desktop":
            try:
                import tempfile
                with tempfile.NamedTemporaryFile(suffix=".vbs", delete=False, mode="w") as f:
                    f.write('CreateObject("Shell.Application").ToggleDesktop()\n')
                    vbs_path = f.name
                subprocess.run(["cscript", "//nologo", vbs_path], creationflags=subprocess.CREATE_NO_WINDOW)
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content="Showing desktop.",
                    success=True,
                    metadata={"action": "show_desktop"},
                )
            except Exception as e:
                return ToolResult(
                    tool_name="windows_desktop_action",
                    content=f"Failed to show desktop: {e}",
                    success=False,
                )

        else:
            return ToolResult(
                tool_name="windows_desktop_action",
                content=(
                    f"Unknown action '{action}'. "
                    "Supported: open_application, close_application, open_folder, "
                    "open_url, search_web, show_desktop."
                ),
                success=False,
            )


__all__ = ["WindowsDesktopActionTool"]
