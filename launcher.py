"""Desktop launcher used by PyInstaller builds."""
from __future__ import annotations

import os
import threading
import time
import webbrowser

import uvicorn


def open_browser() -> None:
    time.sleep(1.5)
    webbrowser.open(f"http://localhost:{os.environ.get('PORT', '5175')}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5175"))
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("agent:app", host="127.0.0.1", port=port)
