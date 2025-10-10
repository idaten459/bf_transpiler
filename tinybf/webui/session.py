from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from typing import Dict, List, Optional

from tinybf.visualizer import VisualizerSession


@dataclass
class SessionRecord:
    session_id: str
    session: VisualizerSession
    language: str
    original_source: Optional[str] = None


class SessionStore:
    """Thread-safe registry for VisualizerSession instances."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionRecord] = {}
        self._lock = threading.RLock()

    def create_session(
        self,
        *,
        code: str,
        input_template: List[int],
        tape_window: int = 10,
        max_steps: Optional[int] = None,
        history_limit: int = 200,
        source: Optional[str] = None,
        language: str = "brainfuck",
    ) -> SessionRecord:
        session = VisualizerSession(
            code=code,
            input_template=input_template,
            tape_window=tape_window,
            max_steps=max_steps,
            history_limit=history_limit,
            source=source,
        )
        session_id = uuid.uuid4().hex
        record = SessionRecord(
            session_id=session_id,
            session=session,
            language=language,
            original_source=source,
        )
        with self._lock:
            self._sessions[session_id] = record
        return record

    def get(self, session_id: str) -> SessionRecord:
        with self._lock:
            try:
                return self._sessions[session_id]
            except KeyError as exc:
                raise KeyError(f"Unknown session id: {session_id}") from exc

    def reset(self, session_id: str) -> SessionRecord:
        record = self.get(session_id)
        session = record.session
        session.history.clear()
        session.hit_breakpoint = None
        session.restart()
        return record

    def remove(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()


__all__ = ["SessionRecord", "SessionStore"]
