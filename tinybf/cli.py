from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable, Optional

from .bf_interpreter import BrainfuckInterpreter
from .transpiler import BrainfuckTranspiler, ParseError, SemanticError


def _read_source(path: str) -> str:
    source_path = Path(path)
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {path}")
    return source_path.read_text(encoding="utf-8")


def _write_output(path: str, data: str) -> None:
    output_path = Path(path)
    output_path.write_text(data, encoding="utf-8")


def _to_input_bytes(data: str) -> Iterable[int]:
    return [ord(ch) for ch in data]


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="TinyBF transpiler CLI")
    parser.add_argument("source", help="Path to TinyBF source file")
    parser.add_argument(
        "-o",
        "--emit",
        help="Destination file for emitted Brainfuck (default: print to stdout)",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the Brainfuck program after transpilation",
    )
    parser.add_argument(
        "--input",
        help="Optional input string supplied to the Brainfuck program when running",
        default="",
    )
    args = parser.parse_args(argv)

    try:
        source_text = _read_source(args.source)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    transpiler = BrainfuckTranspiler()
    try:
        brainfuck_code = transpiler.transpile(source_text)
    except (ParseError, SemanticError) as exc:
        print(f"Transpilation error: {exc}", file=sys.stderr)
        return 1

    if args.emit:
        _write_output(args.emit, brainfuck_code)
    elif not args.run:
        sys.stdout.write(brainfuck_code)
        if not brainfuck_code.endswith("\n"):
            sys.stdout.write("\n")

    if args.run:
        interpreter = BrainfuckInterpreter()
        output = interpreter.run(brainfuck_code, input_data=_to_input_bytes(args.input))
        sys.stdout.write(output)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
