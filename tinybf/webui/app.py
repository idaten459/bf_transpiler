from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator

from tinybf.bf_interpreter import BrainfuckInterpreter, ExecutionState, StepLimitExceeded
from tinybf.visualizer import VisualizerSession
from tinybf.transpiler import BrainfuckTranspiler, ParseError, SemanticError

from .session import SessionRecord, SessionStore


def _string_to_input_bytes(data: str) -> List[int]:
    return [ord(ch) for ch in data]


def _state_to_dict(state: ExecutionState) -> dict:
    return {
        "step": state.step,
        "pc": state.pc,
        "command": state.command,
        "pointer": state.pointer,
        "tape_start": state.tape_start,
        "tape": list(state.tape),
        "output": state.output,
        "code_length": state.code_length,
    }


def _calculate_total_steps(code: str, input_template: List[int], cap: int = 10000) -> tuple[int, bool]:
    interpreter = BrainfuckInterpreter()
    total = 0
    try:
        for state in interpreter.step(
            code,
            input_data=list(input_template),
            max_steps=cap,
        ):
            if state.step > total:
                total = state.step
    except StepLimitExceeded:
        return cap, True
    return total, total >= cap


class SessionConfiguration(BaseModel):
    code: str = ""
    input: str = ""
    tape_window: int = Field(default=10, ge=0)
    max_steps: Optional[int] = Field(default=None, ge=1)
    history_limit: int = Field(default=200, ge=1)
    source: Optional[str] = None
    language: str = "brainfuck"

    @validator("code")
    def validate_code(cls, value: str) -> str:
        if value is None:
            raise ValueError("code must be provided")
        return value

    @validator("language")
    def validate_language(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"brainfuck", "tinybf"}:
            raise ValueError("language must be either 'brainfuck' or 'tinybf'")
        return normalized


class SessionState(BaseModel):
    step: int
    pc: int
    command: Optional[str]
    pointer: int
    tape_start: int
    tape: List[int]
    output: str
    code_length: int


class SessionPayload(BaseModel):
    session_id: str
    language: str
    code: str
    original_source: Optional[str]
    state: SessionState
    history: List[SessionState]
    finished: bool
    history_size: int
    breakpoints: List[int]
    hit_breakpoint: Optional[int]
    total_steps: int
    total_steps_capped: bool


class StepRequest(BaseModel):
    count: int = Field(default=1, ge=1)


class StepResponse(BaseModel):
    session_id: str
    language: str
    code: str
    states: List[SessionState]
    history: List[SessionState]
    finished: bool
    history_size: int
    breakpoints: List[int]
    hit_breakpoint: Optional[int]
    total_steps: int
    total_steps_capped: bool


class RunRequest(BaseModel):
    limit: Optional[int] = Field(default=None, ge=1)
    ignore_breakpoints: bool = False


class BreakpointRequest(BaseModel):
    pc: int = Field(ge=0)


def create_app(
    store: Optional[SessionStore] = None,
    *,
    static_dir: Optional[Path] = None,
) -> FastAPI:
    session_store = store or SessionStore()
    app = FastAPI(title="TinyBF WebUI API", version="0.1.0")

    static_directory = static_dir or Path(__file__).resolve().parent / "static"
    if static_directory.exists():
        app.mount("/static", StaticFiles(directory=str(static_directory)), name="static")

        @app.get("/", response_class=FileResponse)
        def serve_index() -> FileResponse:
            index_path = static_directory / "index.html"
            if not index_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="index.html not found",
                )
            return FileResponse(index_path)

    def _history_states(session: VisualizerSession) -> List[SessionState]:
        return [SessionState(**_state_to_dict(state)) for state in session.history]

    def _build_payload(record: SessionRecord) -> SessionPayload:
        session = record.session
        state = session.current_state()
        return SessionPayload(
            session_id=record.session_id,
            language=record.language,
            code=session.code,
            original_source=record.original_source,
            state=SessionState(**_state_to_dict(state)),
            history=_history_states(session),
            finished=session.is_finished(),
            history_size=len(session.history),
            breakpoints=session.list_breakpoints(),
            hit_breakpoint=session.hit_breakpoint,
            total_steps=record.total_steps,
            total_steps_capped=record.total_steps_capped,
        )

    def _serialize_states(states: List[ExecutionState]) -> List[SessionState]:
        return [SessionState(**_state_to_dict(state)) for state in states]

    @app.post("/api/session", response_model=SessionPayload, status_code=status.HTTP_201_CREATED)
    def create_session(payload: SessionConfiguration) -> SessionPayload:
        language = payload.language
        source_text = payload.code
        brainfuck_code = source_text
        original_source: Optional[str] = payload.source

        if language == "tinybf":
            transpiler = BrainfuckTranspiler()
            original_source = source_text
            try:
                brainfuck_code = transpiler.transpile(source_text)
            except (ParseError, SemanticError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(exc),
                ) from exc

        input_bytes = _string_to_input_bytes(payload.input)
        total_steps, total_steps_capped = _calculate_total_steps(
            brainfuck_code,
            input_bytes,
        )

        record: SessionRecord = session_store.create_session(
            code=brainfuck_code,
            input_template=input_bytes,
            tape_window=payload.tape_window,
            max_steps=payload.max_steps,
            history_limit=payload.history_limit,
            source=original_source,
            language=language,
            total_steps=total_steps,
            total_steps_capped=total_steps_capped,
        )
        return _build_payload(record)

    @app.get("/api/session/{session_id}", response_model=SessionPayload)
    def get_session(session_id: str) -> SessionPayload:
        try:
            record = session_store.get(session_id)
        except KeyError as exc:  # pragma: no cover - fastapi handles
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return _build_payload(record)

    @app.post("/api/session/{session_id}/reset", response_model=SessionPayload)
    def reset_session(session_id: str) -> SessionPayload:
        try:
            record = session_store.reset(session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return _build_payload(record)

    @app.post("/api/session/{session_id}/step", response_model=StepResponse)
    def step_session(session_id: str, payload: StepRequest) -> StepResponse:
        try:
            record = session_store.get(session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        session = record.session
        try:
            states = session.step_forward(payload.count)
        except StepLimitExceeded as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc

        return StepResponse(
            session_id=record.session_id,
            language=record.language,
            code=session.code,
            states=_serialize_states(list(states)),
            history=_history_states(session),
            finished=session.is_finished(),
            history_size=len(session.history),
            breakpoints=session.list_breakpoints(),
            hit_breakpoint=session.hit_breakpoint,
            total_steps=record.total_steps,
            total_steps_capped=record.total_steps_capped,
        )

    @app.post("/api/session/{session_id}/run", response_model=StepResponse)
    def run_session(session_id: str, payload: RunRequest) -> StepResponse:
        try:
            record = session_store.get(session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        session = record.session
        original_breakpoints: Optional[set[int]] = None
        if payload.ignore_breakpoints:
            original_breakpoints = set(session.breakpoints)
            session.clear_breakpoints()
            session.hit_breakpoint = None

        try:
            states = list(session.run_until_break(payload.limit))
        except StepLimitExceeded as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc
        finally:
            if payload.ignore_breakpoints and original_breakpoints is not None:
                session.breakpoints = set(original_breakpoints)
                session.hit_breakpoint = None

        return StepResponse(
            session_id=record.session_id,
            language=record.language,
            code=session.code,
            states=_serialize_states(states),
            history=_history_states(session),
            finished=session.is_finished(),
            history_size=len(session.history),
            breakpoints=session.list_breakpoints(),
            hit_breakpoint=session.hit_breakpoint,
            total_steps=record.total_steps,
            total_steps_capped=record.total_steps_capped,
        )

    @app.post("/api/session/{session_id}/breakpoints", response_model=SessionPayload)
    def add_breakpoint(session_id: str, payload: BreakpointRequest) -> SessionPayload:
        try:
            record = session_store.get(session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        record.session.add_breakpoint(payload.pc)
        return _build_payload(record)

    @app.delete("/api/session/{session_id}/breakpoints/{pc}", response_model=SessionPayload)
    def remove_breakpoint(session_id: str, pc: int) -> SessionPayload:
        try:
            record = session_store.get(session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        removed = record.session.remove_breakpoint(pc)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Breakpoint not found at pc={pc}",
            )
        return _build_payload(record)

    @app.delete("/api/session/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_session(session_id: str) -> Response:
        removed = session_store.remove(session_id)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown session id: {session_id}",
            )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


__all__ = ["create_app"]
