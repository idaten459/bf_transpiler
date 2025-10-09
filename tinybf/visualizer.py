from __future__ import annotations

import argparse
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from .bf_interpreter import BrainfuckInterpreter, ExecutionState, StepLimitExceeded
from .transpiler import BrainfuckTranspiler, ParseError, SemanticError


def _to_input_bytes(data: str) -> List[int]:
    return [ord(ch) for ch in data]


@dataclass
class VisualizerSession:
    code: str
    input_template: List[int]
    tape_window: int = 10
    max_steps: Optional[int] = None
    history_limit: int = 200
    source: Optional[str] = None

    def __post_init__(self) -> None:
        self.breakpoints: set[int] = set()
        self.history: List[ExecutionState] = []
        self.hit_breakpoint: Optional[int] = None
        self._init_interpreter()

    def _init_interpreter(self) -> None:
        self.interpreter = BrainfuckInterpreter()
        self._restart_generator()
        self.finished = False
        self.last_state: ExecutionState = self._initial_state()
        self._record_state(self.last_state)

    def _restart_generator(self) -> None:
        self.step_iter = self.interpreter.step(
            self.code,
            input_data=list(self.input_template),
            max_steps=self.max_steps,
            tape_window=self.tape_window,
        )

    def restart(self) -> None:
        self._init_interpreter()

    def _initial_state(self) -> ExecutionState:
        pointer = self.interpreter.pointer
        start = max(0, pointer - self.tape_window)
        end = min(self.interpreter.tape_length, pointer + self.tape_window + 1)
        tape_view = self.interpreter.tape[start:end].copy()
        return ExecutionState(
            step=0,
            pc=0,
            command=None,
            pointer=pointer,
            tape_start=start,
            tape=tape_view,
            output="",
            code_length=len(self.code),
        )

    def _record_state(self, state: ExecutionState) -> None:
        self.history.append(state)
        if len(self.history) > self.history_limit:
            self.history.pop(0)
        self.last_state = state

    def step_forward(self, count: int = 1) -> Sequence[ExecutionState]:
        states: List[ExecutionState] = []
        if count <= 0:
            return states
        self.hit_breakpoint = None
        for _ in range(count):
            if self.finished:
                break
            try:
                state = next(self.step_iter)
            except StopIteration:
                self.finished = True
                break
            except StepLimitExceeded:
                self.finished = True
                raise
            self._record_state(state)
            states.append(state)
            if state.command is None and state.pc >= len(self.code):
                self.finished = True
                break
            if state.pc in self.breakpoints:
                self.hit_breakpoint = state.pc
                break
        if not states and self.finished:
            self.hit_breakpoint = None
        return states

    def run_until_break(self, limit: Optional[int] = None) -> Sequence[ExecutionState]:
        states: List[ExecutionState] = []
        executed = 0
        try:
            while limit is None or executed < limit:
                step_states = self.step_forward(1)
                if not step_states:
                    break
                states.extend(step_states)
                executed += 1
                if self.hit_breakpoint is not None:
                    break
        except StepLimitExceeded:
            raise
        return states

    def current_state(self) -> ExecutionState:
        return self.last_state

    def add_breakpoint(self, pc: int) -> None:
        self.breakpoints.add(pc)

    def remove_breakpoint(self, pc: int) -> bool:
        if pc in self.breakpoints:
            self.breakpoints.remove(pc)
            return True
        return False

    def clear_breakpoints(self) -> None:
        self.breakpoints.clear()

    def list_breakpoints(self) -> List[int]:
        return sorted(self.breakpoints)

    def is_finished(self) -> bool:
        return self.finished


def format_state(state: ExecutionState, code: str) -> str:
    lines: List[str] = []
    cmd_display = state.command if state.command is not None else "(init)"
    lines.append(
        f"step={state.step} pc={state.pc}/{state.code_length} command={cmd_display!r} pointer={state.pointer}"
    )
    if state.output:
        lines.append(f"output={state.output!r}")
    tape_parts: List[str] = []
    for idx, value in enumerate(state.tape):
        absolute = state.tape_start + idx
        cell_repr = f"{absolute}:{value:03}"
        if absolute == state.pointer:
            tape_parts.append(f"[{cell_repr}]")
        else:
            tape_parts.append(f" {cell_repr} ")
    lines.append("tape=" + " ".join(tape_parts))
    code_window = _format_code_window(code, state.pc)
    lines.append(f"code={code_window}")
    return "\n".join(lines)


def _format_code_window(code: str, pc: int, window: int = 16) -> str:
    if not code:
        return "(empty)"
    start = max(0, pc - window)
    end = min(len(code), pc + window + 1)
    pieces: List[str] = []
    for index in range(start, end):
        ch = code[index]
        if index == pc:
            pieces.append(f"[{ch}]")
        else:
            pieces.append(ch)
    if pc >= len(code):
        pieces.append("[END]")
    return "".join(pieces)


def run_repl(session: VisualizerSession) -> None:
    print("TinyBF Visualizer (type 'help' for commands)")
    _print_state(session.current_state(), session)
    while True:
        try:
            line = input("(viz) ").strip()
        except EOFError:
            print()
            break
        if not line:
            continue
        parts = shlex.split(line)
        command = parts[0].lower()
        args = parts[1:]
        try:
            if command in {"n", "next"}:
                count = 1
                if args:
                    count = max(1, int(args[0]))
                states = session.step_forward(count)
                if states:
                    _print_state(states[-1], session)
                elif session.is_finished():
                    print("プログラムは終了しています。")
            elif command in {"r", "run"}:
                limit = int(args[0]) if args else None
                try:
                    states = session.run_until_break(limit)
                except StepLimitExceeded:
                    print("ステップ上限に達しました。", file=sys.stderr)
                    continue
                if states:
                    _print_state(states[-1], session)
                    if session.hit_breakpoint is not None:
                        print(f"ブレークポイント {session.hit_breakpoint} に到達しました。")
                        session.hit_breakpoint = None
                elif session.is_finished():
                    print("プログラムは終了しました。")
            elif command == "state":
                _print_state(session.current_state(), session)
            elif command == "history":
                count = int(args[0]) if args else 10
                for state in session.history[-count:]:
                    print("-" * 40)
                    print(format_state(state, session.code))
            elif command == "break":
                if not args:
                    print("ブレークポイントを指定してください。")
                    continue
                pc = int(args[0])
                session.add_breakpoint(pc)
                print(f"ブレークポイント {pc} を設定しました。")
            elif command == "breaks":
                points = session.list_breakpoints()
                if not points:
                    print("ブレークポイントはありません。")
                else:
                    print("ブレークポイント:", ", ".join(map(str, points)))
            elif command == "clear":
                if not args:
                    session.clear_breakpoints()
                    print("ブレークポイントを全て削除しました。")
                else:
                    pc = int(args[0])
                    if session.remove_breakpoint(pc):
                        print(f"ブレークポイント {pc} を削除しました。")
                    else:
                        print(f"ブレークポイント {pc} は存在しません。")
            elif command == "restart":
                session.restart()
                print("セッションを再開しました。")
                _print_state(session.current_state(), session)
            elif command in {"quit", "exit"}:
                break
            elif command == "help":
                _print_help()
            else:
                print("不明なコマンドです。'help' を参照してください。")
        except ValueError:
            print("数値が正しくありません。", file=sys.stderr)


def _print_state(state: ExecutionState, session: VisualizerSession) -> None:
    print("-" * 40)
    print(format_state(state, session.code))


def _print_help() -> None:
    print(
        "利用可能なコマンド:\n"
        "  next [N]    : N ステップ進める (省略時 1)\n"
        "  run [N]     : ブレークポイントまたは N ステップ到達まで実行\n"
        "  state       : 現在の状態を表示\n"
        "  history [N] : 直近 N ステップの履歴を表示\n"
        "  break PC    : 指定 PC にブレークポイントを設定\n"
        "  breaks      : ブレークポイント一覧\n"
        "  clear [PC]  : ブレークポイントを削除 (PC 省略で全削除)\n"
        "  restart     : セッションをリセット\n"
        "  quit/exit   : 終了\n"
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="TinyBF visualizer")
    parser.add_argument("source", help="Path to TinyBF source file")
    parser.add_argument(
        "--input",
        default="",
        help="入力として渡す文字列",
    )
    parser.add_argument(
        "--brainfuck",
        action="store_true",
        help="ソースコードを Brainfuck として扱う",
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=5_000_000,
        help="ステップ上限 (デフォルト: 5,000,000)",
    )
    parser.add_argument(
        "--tape-window",
        type=int,
        default=10,
        help="テープ表示の幅",
    )
    parser.add_argument(
        "--history-limit",
        type=int,
        default=200,
        help="履歴に保持するステップ数",
    )
    args = parser.parse_args(argv)

    try:
        source_text = Path(args.source).read_text(encoding="utf-8")
    except OSError as exc:
        print(f"ファイルを開けません: {exc}", file=sys.stderr)
        return 1

    input_bytes = _to_input_bytes(args.input)

    if args.brainfuck:
        session = VisualizerSession(
            source_text,
            input_template=input_bytes,
            tape_window=args.tape_window,
            max_steps=args.max_steps,
            history_limit=args.history_limit,
        )
    else:
        transpiler = BrainfuckTranspiler()
        try:
            bf_code = transpiler.transpile(source_text)
        except (ParseError, SemanticError) as exc:
            print(f"トランスパイルに失敗しました: {exc}", file=sys.stderr)
            return 1
        session = VisualizerSession(
            bf_code,
            input_template=input_bytes,
            tape_window=args.tape_window,
            max_steps=args.max_steps,
            history_limit=args.history_limit,
            source=source_text,
        )

    try:
        run_repl(session)
    except StepLimitExceeded:
        print("ステップ上限に達しました。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
