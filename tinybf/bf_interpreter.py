from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Iterable, Optional


@dataclass
class BrainfuckInterpreter:
    tape_length: int = 30000
    cell_max: int = 255
    cell_min: int = 0
    debug: bool = False

    tape: List[int] = field(init=False)
    pointer: int = field(init=False)
    output_buffer: List[str] = field(init=False)

    def __post_init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.tape = [0] * self.tape_length
        self.pointer = 0
        self.output_buffer = []

    def run(self, code: str, input_data: Optional[Iterable[int]] = None) -> str:
        self.reset()
        input_iter = iter(input_data or [])
        code_chars = list(code)
        jump_map = self._build_jump_map(code_chars)
        pc = 0

        while pc < len(code_chars):
            command = code_chars[pc]
            if command == ">":
                self.pointer += 1
                if self.pointer >= self.tape_length:
                    raise IndexError("Pointer moved beyond the tape length.")
            elif command == "<":
                self.pointer -= 1
                if self.pointer < 0:
                    raise IndexError("Pointer moved before start of tape.")
            elif command == "+":
                self.tape[self.pointer] = (self.tape[self.pointer] + 1 - self.cell_min) % (self.cell_max + 1) + self.cell_min
            elif command == "-":
                self.tape[self.pointer] = (self.tape[self.pointer] - 1 - self.cell_min) % (self.cell_max + 1) + self.cell_min
            elif command == ".":
                self.output_buffer.append(chr(self.tape[self.pointer]))
            elif command == ",":
                try:
                    self.tape[self.pointer] = next(input_iter)
                except StopIteration:
                    self.tape[self.pointer] = 0
            elif command == "[":
                if self.tape[self.pointer] == 0:
                    pc = jump_map[pc]
            elif command == "]":
                if self.tape[self.pointer] != 0:
                    pc = jump_map[pc]
            # Ignore any non-command characters (e.g., comments)
            pc += 1

        return "".join(self.output_buffer)

    def _build_jump_map(self, code_chars: List[str]) -> Dict[int, int]:
        jump_map: Dict[int, int] = {}
        stack: List[int] = []
        for index, char in enumerate(code_chars):
            if char == "[":
                stack.append(index)
            elif char == "]":
                if not stack:
                    raise ValueError("Unmatched ']' at position {}".format(index))
                start = stack.pop()
                jump_map[start] = index
                jump_map[index] = start
        if stack:
            raise ValueError("Unmatched '[' at position {}".format(stack.pop()))
        return jump_map


__all__ = ["BrainfuckInterpreter"]
