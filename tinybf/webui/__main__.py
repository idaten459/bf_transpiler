from __future__ import annotations

import argparse
import sys
from typing import Optional

from .app import create_app


try:
    import uvicorn
except ModuleNotFoundError as exc:  # pragma: no cover - import failure path
    uvicorn = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Run the TinyBF WebUI API server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload (development only; requires uvicorn reload features)",
    )
    args = parser.parse_args(argv)

    if uvicorn is None:
        message = "uvicorn is required to run the TinyBF WebUI server"
        if _IMPORT_ERROR is not None:
            message = f"{message}: {_IMPORT_ERROR}"
        print(message, file=sys.stderr)
        return 1

    app = create_app()
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
