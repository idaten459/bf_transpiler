from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Optional


class StepLimitExceeded(RuntimeError):
    """Raised when Brainfuck execution exceeds the configured step budget."""


@dataclass
class ExecutionState:
    step: int
    pc: int
    command: Optional[str]
    pointer: int
    tape_start: int
    tape: List[int]
    output: str
    code_length: int


@dataclass
class BrainfuckInterpreter:
    tape_length: int = 30000
    cell_max: int = 255
    cell_min: int = 0
    debug: bool = False

    tape: List[int] = field(init=False, repr=False)
    pointer: int = field(init=False, repr=False)
    output_buffer: List[str] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.tape = [0] * self.tape_length
        self.pointer = 0
        self.output_buffer = []

    def run(
        self,
        code: str,
        input_data: Optional[Iterable[int]] = None,
        max_steps: Optional[int] = None,
    ) -> str:
        for _ in self.step(code, input_data=input_data, max_steps=max_steps):
            pass
        return "".join(self.output_buffer)

    def step(
        self,
        code: str,
        input_data: Optional[Iterable[int]] = None,
        max_steps: Optional[int] = None,
        tape_window: int = 10,
    ) -> Iterator[ExecutionState]:
        self.reset()
        code_chars = list(code)
        input_values = list(input_data or [])
        input_iter = iter(input_values)
        jump_map = self._build_jump_map(code_chars)
        pc = 0
        steps = 0
        code_length = len(code_chars)

        while pc < code_length:
            if max_steps is not None and steps >= max_steps:
                raise StepLimitExceeded("Brainfuck program exceeded allowed step count")

            command = code_chars[pc]
            pc = self._execute_instruction(command, pc, code_chars, jump_map, input_iter)
            steps += 1
            yield self._snapshot(pc, command, steps, code_length, tape_window)

        # Emit final snapshot indicating completion
        yield self._snapshot(pc, None, steps, code_length, tape_window)

    def _execute_instruction(
        self,
        command: str,
        pc: int,
        code_chars: List[str],
        jump_map: Dict[int, int],
        input_iter: Iterator[int],
    ) -> int:
        new_pc = pc + 1
        if command == ">":
            self.pointer += 1
            if self.pointer >= self.tape_length:
                raise IndexError("Pointer moved beyond the tape length.")
        elif command == "<":
            self.pointer -= 1
            if self.pointer < 0:
                raise IndexError("Pointer moved before start of tape.")
        elif command == "+":
            self.tape[self.pointer] = (
                (self.tape[self.pointer] + 1 - self.cell_min) % (self.cell_max + 1)
            ) + self.cell_min
        elif command == "-":
            self.tape[self.pointer] = (
                (self.tape[self.pointer] - 1 - self.cell_min) % (self.cell_max + 1)
            ) + self.cell_min
        elif command == ".":
            self.output_buffer.append(chr(self.tape[self.pointer]))
        elif command == ",":
            try:
                self.tape[self.pointer] = next(input_iter)
            except StopIteration:
                self.tape[self.pointer] = 0
        elif command == "[":
            if self.tape[self.pointer] == 0:
                new_pc = jump_map[pc] + 1
        elif command == "]":
            if self.tape[self.pointer] != 0:
                new_pc = jump_map[pc] + 1
        return new_pc

    def _snapshot(
        self,
        pc: int,
        command: Optional[str],
        step: int,
        code_length: int,
        tape_window: int,
    ) -> ExecutionState:
        start = max(0, self.pointer - tape_window)
        end = min(self.tape_length, self.pointer + tape_window + 1)
        tape_view = self.tape[start:end].copy()
        return ExecutionState(
            step=step,
            pc=pc,
            command=command,
            pointer=self.pointer,
            tape_start=start,
            tape=tape_view,
            output="".join(self.output_buffer),
            code_length=code_length,
        )

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


__all__ = [
    "BrainfuckInterpreter",
    "ExecutionState",
    "StepLimitExceeded",
]
