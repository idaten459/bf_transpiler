from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional


class ParseError(Exception):
    pass


class SemanticError(Exception):
    pass


# === AST Nodes ===


class Expr:
    pass


@dataclass
class NumberLiteral(Expr):
    value: int


@dataclass
class CharLiteral(Expr):
    value: int


@dataclass
class Identifier(Expr):
    name: str


class Statement:
    pass


class VarType(str, Enum):
    NUM = "num"
    CHAR = "char"


@dataclass
class Let(Statement):
    name: str
    value: Expr
    var_type: VarType


@dataclass
class Set(Statement):
    name: str
    expr: Expr


@dataclass
class Add(Statement):
    name: str
    expr: Expr


@dataclass
class Sub(Statement):
    name: str
    expr: Expr


@dataclass
class Mul(Statement):
    name: str
    expr: Expr


@dataclass
class Div(Statement):
    name: str
    expr: Expr


@dataclass
class PrintChar(Statement):
    name: str


@dataclass
class PrintNum(Statement):
    name: str


@dataclass
class InputChar(Statement):
    name: str


@dataclass
class InputNum(Statement):
    name: str


@dataclass
class PrintDec(Statement):
    name: str


@dataclass
class If(Statement):
    condition: str
    true_block: List[Statement]
    false_block: Optional[List[Statement]] = None


@dataclass
class For(Statement):
    name: str
    start: Expr
    end: Expr
    body: List[Statement]


# === Parser ===


class Parser:
    def parse(self, source: str) -> List[Statement]:
        self.lines = self._preprocess(source)
        self.pos = 0
        statements = self._parse_statements(end_token=None)
        if self.pos != len(self.lines):
            raise ParseError("Unexpected extra tokens after program end")
        return statements

    def _preprocess(self, source: str) -> List[str]:
        processed: List[str] = []
        for raw in source.splitlines():
            code = raw.split("#", 1)[0].strip()
            if code:
                processed.append(code)
        return processed

    def _peek(self) -> Optional[str]:
        if self.pos >= len(self.lines):
            return None
        return self.lines[self.pos]

    def _advance(self) -> Optional[str]:
        line = self._peek()
        if line is not None:
            self.pos += 1
        return line

    def _parse_statements(self, end_token: Optional[str]) -> List[Statement]:
        statements: List[Statement] = []
        while self.pos < len(self.lines):
            line = self._peek()
            if line == "}" and end_token == "}":
                self._advance()
                return statements
            if line == "}":
                raise ParseError("Unexpected '}'")
            statements.append(self._parse_statement())
        if end_token is not None:
            raise ParseError("Missing closing '}'")
        return statements

    def _parse_statement(self) -> Statement:
        line = self._advance()
        if line is None:
            raise ParseError("Unexpected EOF while parsing statement")
        if line.startswith("let "):
            return self._parse_let(line)
        if line.startswith("set "):
            return self._parse_set(line)
        if line.startswith("add "):
            return self._parse_add(line)
        if line.startswith("sub "):
            return self._parse_sub(line)
        if line.startswith("mul "):
            return self._parse_mul(line)
        if line.startswith("div "):
            return self._parse_div(line)
        if line.startswith("print_char "):
            name = line.split()[1]
            return PrintChar(name=name)
        if line.startswith("print_num "):
            name = line.split()[1]
            return PrintNum(name=name)
        if line.startswith("print_dec "):
            name = line.split()[1]
            return PrintDec(name=name)
        if line.startswith("input_char "):
            name = line.split()[1]
            return InputChar(name=name)
        if line.startswith("input_num "):
            name = line.split()[1]
            return InputNum(name=name)
        if line.startswith("if "):
            return self._parse_if(line)
        if line.startswith("for "):
            return self._parse_for(line)
        raise ParseError(f"Unknown statement syntax: '{line}'")

    def _parse_let(self, line: str) -> Let:
        parts = line.split()
        if len(parts) != 5 or parts[3] != "=":
            raise ParseError(f"Malformed let statement: '{line}'")
        type_token = parts[1]
        if type_token not in ("num", "char"):
            raise ParseError(f"Unknown type '{type_token}' in let statement")
        var_type = VarType(type_token)
        name = parts[2]
        expr = self._parse_expr(parts[4])
        return Let(name=name, value=expr, var_type=var_type)

    def _parse_set(self, line: str) -> Set:
        parts = line.split()
        if len(parts) != 4 or parts[2] != "=":
            raise ParseError(f"Malformed set statement: '{line}'")
        name = parts[1]
        expr = self._parse_expr(parts[3])
        return Set(name=name, expr=expr)

    def _parse_add(self, line: str) -> Add:
        parts = line.split()
        if len(parts) != 3:
            raise ParseError(f"Malformed add statement: '{line}'")
        name = parts[1]
        expr = self._parse_expr(parts[2])
        return Add(name=name, expr=expr)

    def _parse_sub(self, line: str) -> Sub:
        parts = line.split()
        if len(parts) != 3:
            raise ParseError(f"Malformed sub statement: '{line}'")
        name = parts[1]
        expr = self._parse_expr(parts[2])
        return Sub(name=name, expr=expr)

    def _parse_mul(self, line: str) -> Mul:
        parts = line.split()
        if len(parts) != 3:
            raise ParseError(f"Malformed mul statement: '{line}'")
        name = parts[1]
        expr = self._parse_expr(parts[2])
        return Mul(name=name, expr=expr)

    def _parse_div(self, line: str) -> Div:
        parts = line.split()
        if len(parts) != 3:
            raise ParseError(f"Malformed div statement: '{line}'")
        name = parts[1]
        expr = self._parse_expr(parts[2])
        return Div(name=name, expr=expr)

    def _parse_if(self, line: str) -> If:
        if not line.endswith("{"):
            raise ParseError("If statement must end with '{'")
        condition = line[3:-1].strip()
        if not condition:
            raise ParseError("If condition is missing identifier")
        true_block = self._parse_statements(end_token="}")
        false_block: Optional[List[Statement]] = None
        next_line = self._peek()
        if next_line == "else {":
            self._advance()
            false_block = self._parse_statements(end_token="}")
        return If(condition=condition, true_block=true_block, false_block=false_block)

    def _parse_for(self, line: str) -> For:
        if not line.endswith("{"):
            raise ParseError("For statement must end with '{'")
        body_header = line[4:-1].strip()
        parts = body_header.split()
        if len(parts) != 5 or parts[1] != "from" or parts[3] != "to":
            raise ParseError("For syntax is 'for <var> from <expr> to <expr> {'")
        name = parts[0]
        start_expr = self._parse_expr(parts[2])
        end_expr = self._parse_expr(parts[4])
        body = self._parse_statements(end_token="}")
        return For(name=name, start=start_expr, end=end_expr, body=body)

    def _parse_number(self, token: str, context: str) -> int:
        if not token.isdigit():
            raise ParseError(f"Expected number in {context}, got '{token}'")
        value = int(token)
        if not (0 <= value <= 255):
            raise ParseError(f"Literal out of range 0-255: {value}")
        return value

    def _parse_expr(self, token: str) -> Expr:
        if token.isdigit():
            return NumberLiteral(value=self._parse_number(token, context="expression"))
        if token.startswith("'") and token.endswith("'"):
            if len(token) < 3:
                raise ParseError("Empty character literal")
            char_value = self._parse_char_literal(token)
            return CharLiteral(value=char_value)
        if token.isidentifier():
            return Identifier(name=token)
        raise ParseError(f"Invalid expression token '{token}'")

    def _parse_char_literal(self, token: str) -> int:
        inner = token[1:-1]
        if len(inner) == 1:
            return ord(inner)
        if inner.startswith("\\"):
            escape = inner[1:]
            mapping = {"n": 10, "t": 9, "r": 13, "0": 0, "\\": 92, "'": 39, '"': 34}
            if escape not in mapping:
                raise ParseError(f"Unknown escape sequence '\\{escape}'")
            return mapping[escape]
        raise ParseError(f"Invalid character literal {token}")


# === Code Generator ===


@dataclass
class CodeGenState:
    output: List[str]
    cell_map: Dict[str, int]
    var_types: Dict[str, VarType]
    pointer: int
    temp_a: int
    temp_b: int
    next_cell: int


class BrainfuckTranspiler:
    def __init__(self) -> None:
        self.parser = Parser()

    def transpile(self, source: str) -> str:
        statements = self.parser.parse(source)
        state = CodeGenState(output=[], cell_map={}, var_types={}, pointer=0, temp_a=1, temp_b=2, next_cell=3)
        self._emit_intro(state)
        for stmt in statements:
            self._emit_statement(stmt, state)
        self._move_to(0, state)
        code = "".join(state.output)
        return self._optimize_code(code)

    # --- Helpers ---

    def _emit_intro(self, state: CodeGenState) -> None:
        # Ensure temp cells start at zero (already zero, but explicit for clarity)
        self._move_to(state.temp_a, state)
        self._zero_current(state)
        self._move_to(state.temp_b, state)
        self._zero_current(state)
        self._move_to(0, state)

    def _optimize_code(self, code: str) -> str:
        optimized: list[str] = []
        length = len(code)
        index = 0
        while index < length:
            command = code[index]
            if command in "+-":
                delta = 0
                while index < length and code[index] in "+-":
                    delta += 1 if code[index] == "+" else -1
                    index += 1
                if delta > 0:
                    optimized.append("+" * delta)
                elif delta < 0:
                    optimized.append("-" * (-delta))
                continue
            if command in "<>":
                delta = 0
                while index < length and code[index] in "<>":
                    delta += 1 if code[index] == ">" else -1
                    index += 1
                if delta > 0:
                    optimized.append(">" * delta)
                elif delta < 0:
                    optimized.append("<" * (-delta))
                continue
            optimized.append(command)
            index += 1
        compacted = "".join(optimized)
        return self._collapse_clear_loop_runs(compacted)

    def _collapse_clear_loop_runs(self, code: str) -> str:
        changed = True
        current = code
        while changed:
            current, changed = self._collapse_clear_loop_runs_once(current)
        return current

    def _collapse_clear_loop_runs_once(self, code: str) -> tuple[str, bool]:
        bracket_map = self._build_bracket_map(code)
        if bracket_map is None:
            return code, False

        result: list[str] = []
        changed = False
        index = 0
        while index < len(code):
            char = code[index]
            if char == "[":
                end = bracket_map.get(index)
                if end is None:
                    result.append(char)
                    index += 1
                    continue
                loop_str = code[index : end + 1]
                body = code[index + 1 : end]
                if self._is_clear_loop(body):
                    next_index = end + 1
                    loop_len = len(loop_str)
                    while next_index <= len(code) - loop_len and code[next_index : next_index + loop_len] == loop_str:
                        changed = True
                        next_index += loop_len
                    result.append(loop_str)
                    index = next_index
                    continue
                result.append(loop_str)
                index = end + 1
                continue
            result.append(char)
            index += 1
        return "".join(result), changed

    def _build_bracket_map(self, code: str) -> Optional[Dict[int, int]]:
        stack: list[int] = []
        mapping: Dict[int, int] = {}
        for pos, char in enumerate(code):
            if char == "[":
                stack.append(pos)
            elif char == "]":
                if not stack:
                    return None
                start = stack.pop()
                mapping[start] = pos
        if stack:
            return None
        return mapping

    def _is_clear_loop(self, body: str) -> bool:
        if not body:
            return False
        pointer = 0
        home_decrements = 0
        home_increments = 0
        for char in body:
            if char == ">":
                pointer += 1
            elif char == "<":
                pointer -= 1
            elif char == "+":
                if pointer == 0:
                    home_increments += 1
            elif char == "-":
                if pointer == 0:
                    home_decrements += 1
            else:
                return False
        return pointer == 0 and home_decrements > 0 and home_increments == 0

    def _get_scratch_cell(self, state: CodeGenState, *exclude: int) -> int:
        for candidate in (state.temp_a, state.temp_b):
            if candidate not in exclude:
                return candidate
        cell = state.next_cell
        state.next_cell += 1
        return cell

    def _allocate_cell(self, state: CodeGenState) -> int:
        cell = state.next_cell
        state.next_cell += 1
        return cell

    def _set_cell(self, cell: int, value: int, state: CodeGenState) -> None:
        self._zero_cell(cell, state)
        if value > 0:
            self._increment_cell(cell, value, state)

    def _is_zero(self, cell: int, flag: int, state: CodeGenState) -> None:
        temp = self._allocate_cell(state)
        self._set_cell(flag, 1, state)
        self._zero_cell(temp, state)
        self._copy_cell(cell, temp, state)
        self._move_to(temp, state)
        state.output.append("[")
        self._move_to(temp, state)
        state.output.append("-")
        self._move_to(flag, state)
        state.output.append("[-]")
        self._move_to(temp, state)
        state.output.append("]")
        self._zero_cell(temp, state)
        self._move_to(0, state)

    def _subtract_divisor_if_possible(
        self,
        remainder: int,
        divisor: int,
        success_flag: int,
        state: CodeGenState,
    ) -> None:
        remainder_backup = self._allocate_cell(state)
        divisor_copy = self._allocate_cell(state)
        zero_flag = self._allocate_cell(state)
        temp_flag = self._allocate_cell(state)
        failure_flag = self._allocate_cell(state)

        self._set_cell(success_flag, 1, state)
        self._zero_cell(failure_flag, state)
        self._zero_cell(remainder_backup, state)
        self._copy_cell(remainder, remainder_backup, state)
        self._zero_cell(divisor_copy, state)
        self._copy_cell(divisor, divisor_copy, state)

        self._move_to(divisor_copy, state)
        state.output.append("[")
        self._move_to(divisor_copy, state)
        state.output.append("-")

        self._is_zero(remainder, zero_flag, state)
        self._move_to(zero_flag, state)
        state.output.append("[")
        self._move_to(zero_flag, state)
        state.output.append("-")
        self._zero_cell(success_flag, state)
        self._set_cell(failure_flag, 1, state)
        self._move_to(divisor_copy, state)
        state.output.append("[-]")
        self._move_to(zero_flag, state)
        state.output.append("]")
        self._zero_cell(zero_flag, state)

        self._zero_cell(temp_flag, state)
        self._copy_cell(success_flag, temp_flag, state)
        self._move_to(temp_flag, state)
        state.output.append("[")
        self._move_to(temp_flag, state)
        state.output.append("-")
        self._move_to(remainder, state)
        state.output.append("-")
        self._move_to(temp_flag, state)
        state.output.append("]")
        self._zero_cell(temp_flag, state)

        self._move_to(divisor_copy, state)
        state.output.append("]")

        self._move_to(failure_flag, state)
        state.output.append("[")
        self._move_to(failure_flag, state)
        state.output.append("-")
        self._zero_cell(remainder, state)
        self._copy_cell(remainder_backup, remainder, state)
        self._move_to(failure_flag, state)
        state.output.append("]")

        self._zero_cell(remainder_backup, state)
        self._zero_cell(divisor_copy, state)
        self._zero_cell(zero_flag, state)
        self._zero_cell(temp_flag, state)
        self._zero_cell(failure_flag, state)
        self._move_to(0, state)

    def _move_to(self, cell: int, state: CodeGenState) -> None:
        delta = cell - state.pointer
        if delta > 0:
            state.output.append(">" * delta)
        elif delta < 0:
            state.output.append("<" * (-delta))
        state.pointer = cell

    def _zero_current(self, state: CodeGenState) -> None:
        state.output.append("[-]")

    def _zero_cell(self, cell: int, state: CodeGenState) -> None:
        self._move_to(cell, state)
        self._zero_current(state)

    def _increment_cell(self, cell: int, amount: int, state: CodeGenState) -> None:
        if amount == 0:
            return
        if amount > 0 and self._try_scaled_increment(cell, amount, state, subtract=False):
            return
        if amount < 0 and self._try_scaled_increment(cell, -amount, state, subtract=True):
            return
        self._emit_linear_increment(cell, amount, state)

    def _emit_linear_increment(self, cell: int, amount: int, state: CodeGenState) -> None:
        if amount == 0:
            return
        self._move_to(cell, state)
        if amount > 0:
            state.output.append("+" * amount)
        else:
            state.output.append("-" * (-amount))

    def _try_scaled_increment(self, cell: int, magnitude: int, state: CodeGenState, *, subtract: bool) -> bool:
        scratch = self._get_scratch_cell(state, cell)
        distance = abs(cell - scratch)
        if distance == 0:
            return False
        pattern = self._select_scaled_increment(magnitude, distance)
        if pattern is None:
            return False
        _, loop_count, step, remainder = pattern
        self._zero_cell(scratch, state)
        self._emit_linear_increment(scratch, loop_count, state)
        self._move_to(scratch, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(cell, state)
        if step:
            op = "-" if subtract else "+"
            state.output.append(op * step)
        self._move_to(scratch, state)
        state.output.append("]")
        self._move_to(cell, state)
        if remainder:
            remainder_amount = -remainder if subtract else remainder
            self._emit_linear_increment(cell, remainder_amount, state)
        return True

    def _select_scaled_increment(self, magnitude: int, distance: int) -> Optional[tuple[int, int, int, int]]:
        if magnitude <= 0:
            return None
        best: Optional[tuple[int, int, int, int]] = None
        max_loops = min(16, magnitude)
        for loop_count in range(2, max_loops + 1):
            step = magnitude // loop_count
            if step == 0:
                break
            remainder = magnitude - loop_count * step
            cost = loop_count + step + remainder + 4 * distance + 5
            if best is None or cost < best[0]:
                best = (cost, loop_count, step, remainder)
        if best is None or best[0] >= magnitude:
            return None
        return best

    def _ensure_cell(self, name: str, var_type: VarType, state: CodeGenState) -> int:
        if name in state.cell_map:
            if state.var_types[name] != var_type:
                raise SemanticError(f"Variable '{name}' already declared with different type")
            return state.cell_map[name]
        cell = state.next_cell
        state.next_cell += 1
        state.cell_map[name] = cell
        state.var_types[name] = var_type
        self._zero_cell(cell, state)
        return cell

    def _get_var(self, name: str, state: CodeGenState) -> tuple[int, VarType]:
        if name not in state.cell_map:
            raise SemanticError(f"Variable '{name}' is not declared")
        return state.cell_map[name], state.var_types[name]

    def _expr_type(self, expr: Expr, state: CodeGenState) -> VarType:
        if isinstance(expr, NumberLiteral):
            return VarType.NUM
        if isinstance(expr, CharLiteral):
            return VarType.CHAR
        if isinstance(expr, Identifier):
            _, var_type = self._get_var(expr.name, state)
            return var_type
        raise SemanticError("Unknown expression type")

    def _materialize_expr(self, expr: Expr, state: CodeGenState) -> tuple[int, VarType, bool]:
        expr_type = self._expr_type(expr, state)
        if isinstance(expr, NumberLiteral):
            cell = self._allocate_cell(state)
            self._zero_cell(cell, state)
            self._increment_cell(cell, expr.value, state)
            return cell, expr_type, True
        if isinstance(expr, CharLiteral):
            cell = self._allocate_cell(state)
            self._zero_cell(cell, state)
            self._increment_cell(cell, expr.value, state)
            return cell, expr_type, True
        if isinstance(expr, Identifier):
            source_cell, source_type = self._get_var(expr.name, state)
            temp_cell = self._allocate_cell(state)
            self._zero_cell(temp_cell, state)
            self._copy_cell(source_cell, temp_cell, state)
            return temp_cell, source_type, True
        raise SemanticError("Unsupported expression materialization")

    def _assign_expr(self, target_cell: int, target_type: VarType, expr: Expr, state: CodeGenState) -> None:
        expr_type = self._expr_type(expr, state)
        if expr_type != target_type:
            # Allow implicit conversion between numeric and char since both map to byte values
            if not ({expr_type, target_type} <= {VarType.NUM, VarType.CHAR}):
                raise SemanticError("Type mismatch in assignment")
        if isinstance(expr, (NumberLiteral, CharLiteral)):
            self._zero_cell(target_cell, state)
            self._increment_cell(target_cell, expr.value, state)
        elif isinstance(expr, Identifier):
            source_cell, _ = self._get_var(expr.name, state)
            if source_cell == target_cell:
                self._move_to(0, state)
                return
            self._zero_cell(target_cell, state)
            self._copy_cell(source_cell, target_cell, state)
        else:
            raise SemanticError("Unsupported expression type")
        self._move_to(0, state)

    def _add_expr(self, target_cell: int, expr: Expr, state: CodeGenState, subtract: bool = False) -> None:
        expr_type = self._expr_type(expr, state)
        if expr_type not in (VarType.NUM, VarType.CHAR):
            raise SemanticError("Arithmetic requires numeric or char operands")
        if isinstance(expr, (NumberLiteral, CharLiteral)):
            amount = -expr.value if subtract else expr.value
            self._increment_cell(target_cell, amount, state)
            self._move_to(0, state)
            return
        if isinstance(expr, Identifier):
            source_cell, _ = self._get_var(expr.name, state)
            if subtract:
                self._transfer_subtract(source_cell, target_cell, state)
            else:
                self._transfer_add(source_cell, target_cell, state)
            self._move_to(0, state)
            return
        raise SemanticError("Unsupported expression in arithmetic")

    def _multiply_literal(self, target_cell: int, literal: int, state: CodeGenState) -> None:
        if literal == 0:
            self._zero_cell(target_cell, state)
            self._move_to(0, state)
            return
        if literal == 1:
            self._move_to(0, state)
            return
        source_copy = self._allocate_cell(state)
        self._zero_cell(source_copy, state)
        self._copy_cell(target_cell, source_copy, state)
        self._zero_cell(target_cell, state)
        self._move_to(source_copy, state)
        state.output.append("[")
        self._move_to(source_copy, state)
        state.output.append("-")
        self._increment_cell(target_cell, literal, state)
        self._move_to(source_copy, state)
        state.output.append("]")
        self._zero_cell(source_copy, state)
        self._move_to(0, state)

    def _multiply_cell(self, target_cell: int, operand_cell: int, state: CodeGenState) -> None:
        multiplicand = self._allocate_cell(state)
        multiplier = self._allocate_cell(state)

        self._zero_cell(multiplicand, state)
        self._copy_cell(target_cell, multiplicand, state)
        self._zero_cell(multiplier, state)
        self._copy_cell(operand_cell, multiplier, state)

        self._zero_cell(target_cell, state)

        self._move_to(multiplier, state)
        state.output.append("[")
        self._move_to(multiplier, state)
        state.output.append("-")
        self._transfer_add(multiplicand, target_cell, state)
        self._move_to(multiplier, state)
        state.output.append("]")

        self._zero_cell(multiplier, state)
        self._zero_cell(multiplicand, state)
        self._move_to(0, state)

    def _divide_literal(self, target_cell: int, literal: int, state: CodeGenState) -> None:
        if literal < 0:
            raise SemanticError("divisor must be non-negative")
        divisor_cell = self._allocate_cell(state)
        self._set_cell(divisor_cell, literal, state)
        self._divide_cells(target_cell, divisor_cell, state)
        self._zero_cell(divisor_cell, state)

    def _divide_cells(self, target_cell: int, divisor_cell: int, state: CodeGenState) -> None:
        execute_flag = self._allocate_cell(state)
        self._set_cell(execute_flag, 1, state)

        divisor_zero_flag = self._allocate_cell(state)
        self._is_zero(divisor_cell, divisor_zero_flag, state)
        self._move_to(divisor_zero_flag, state)
        state.output.append("[")
        self._move_to(divisor_zero_flag, state)
        state.output.append("-")
        self._zero_cell(target_cell, state)
        self._move_to(execute_flag, state)
        state.output.append("[-]")
        self._move_to(divisor_zero_flag, state)
        state.output.append("]")
        self._zero_cell(divisor_zero_flag, state)

        remainder_cell = self._allocate_cell(state)
        success_flag = self._allocate_cell(state)
        loop_flag = self._allocate_cell(state)

        self._move_to(execute_flag, state)
        state.output.append("[")
        self._move_to(execute_flag, state)
        state.output.append("-")

        self._zero_cell(remainder_cell, state)
        self._copy_cell(target_cell, remainder_cell, state)
        self._zero_cell(target_cell, state)

        self._set_cell(loop_flag, 1, state)
        self._move_to(loop_flag, state)
        state.output.append("[")
        self._move_to(loop_flag, state)
        state.output.append("-")
        self._subtract_divisor_if_possible(remainder_cell, divisor_cell, success_flag, state)
        self._move_to(success_flag, state)
        state.output.append("[")
        self._move_to(success_flag, state)
        state.output.append("-")
        self._increment_cell(target_cell, 1, state)
        self._move_to(loop_flag, state)
        state.output.append("+")
        self._move_to(success_flag, state)
        state.output.append("]")
        self._move_to(success_flag, state)
        state.output.append("[-]")
        self._move_to(loop_flag, state)
        state.output.append("]")

        self._zero_cell(loop_flag, state)
        self._zero_cell(remainder_cell, state)
        self._zero_cell(success_flag, state)
        self._move_to(execute_flag, state)
        state.output.append("[-]")
        self._move_to(execute_flag, state)
        state.output.append("]")

        self._zero_cell(execute_flag, state)
        self._move_to(0, state)

    def _copy_cell(self, source: int, target: int, state: CodeGenState) -> None:
        if source == target:
            return
        temp = self._get_scratch_cell(state, source, target)
        # temp = 0, target = 0
        self._zero_cell(temp, state)
        self._zero_cell(target, state)
        # Move source -> target and temp, then restore from temp
        self._move_to(source, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(target, state)
        state.output.append("+")
        self._move_to(temp, state)
        state.output.append("+")
        self._move_to(source, state)
        state.output.append("]")
        # Restore source from temp
        self._move_to(temp, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(source, state)
        state.output.append("+")
        self._move_to(temp, state)
        state.output.append("]")
        self._move_to(0, state)

    def _transfer_add(self, source: int, target: int, state: CodeGenState) -> None:
        temp = self._get_scratch_cell(state, source, target)
        self._zero_cell(temp, state)
        self._move_to(source, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(target, state)
        state.output.append("+")
        self._move_to(temp, state)
        state.output.append("+")
        self._move_to(source, state)
        state.output.append("]")
        # restore source
        self._move_to(temp, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(source, state)
        state.output.append("+")
        self._move_to(temp, state)
        state.output.append("]")
        self._move_to(0, state)

    def _transfer_subtract(self, source: int, target: int, state: CodeGenState) -> None:
        temp = self._get_scratch_cell(state, source, target)
        self._zero_cell(temp, state)
        self._move_to(source, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(target, state)
        state.output.append("-")
        self._move_to(temp, state)
        state.output.append("+")
        self._move_to(source, state)
        state.output.append("]")
        # restore source
        self._move_to(temp, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(source, state)
        state.output.append("+")
        self._move_to(temp, state)
        state.output.append("]")
        self._move_to(0, state)

    # --- Statement emitters ---

    def _emit_statement(self, stmt: Statement, state: CodeGenState) -> None:
        if isinstance(stmt, Let):
            cell = self._ensure_cell(stmt.name, stmt.var_type, state)
            self._assign_expr(cell, stmt.var_type, stmt.value, state)
        elif isinstance(stmt, Set):
            cell, var_type = self._get_var(stmt.name, state)
            self._assign_expr(cell, var_type, stmt.expr, state)
        elif isinstance(stmt, Add):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type not in (VarType.NUM, VarType.CHAR):
                raise SemanticError("'add' is only valid for numeric or char variables")
            self._add_expr(cell, stmt.expr, state, subtract=False)
        elif isinstance(stmt, Sub):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type not in (VarType.NUM, VarType.CHAR):
                raise SemanticError("'sub' is only valid for numeric or char variables")
            self._add_expr(cell, stmt.expr, state, subtract=True)
        elif isinstance(stmt, Mul):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type not in (VarType.NUM, VarType.CHAR):
                raise SemanticError("'mul' is only valid for numeric or char variables")
            if isinstance(stmt.expr, NumberLiteral):
                self._multiply_literal(cell, stmt.expr.value, state)
            elif isinstance(stmt.expr, CharLiteral):
                self._multiply_literal(cell, stmt.expr.value, state)
            else:
                operand_cell, operand_type = self._get_var(stmt.expr.name, state) if isinstance(stmt.expr, Identifier) else (None, None)
                if operand_cell is None:
                    raise SemanticError("mul operand must be a literal or variable")
                if operand_type not in (VarType.NUM, VarType.CHAR):
                    raise SemanticError("mul operand must be numeric or char")
                self._multiply_cell(cell, operand_cell, state)
        elif isinstance(stmt, Div):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type != VarType.NUM:
                raise SemanticError("'div' is only valid for numeric variables")
            if isinstance(stmt.expr, NumberLiteral):
                self._divide_literal(cell, stmt.expr.value, state)
            elif isinstance(stmt.expr, CharLiteral):
                self._divide_literal(cell, stmt.expr.value, state)
            else:
                if not isinstance(stmt.expr, Identifier):
                    raise SemanticError("div operand must be a literal or variable")
                operand_cell, operand_type = self._get_var(stmt.expr.name, state)
                if operand_type not in (VarType.NUM, VarType.CHAR):
                    raise SemanticError("div operand must be numeric or char")
                self._divide_cells(cell, operand_cell, state)
        elif isinstance(stmt, PrintChar):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type != VarType.CHAR:
                raise SemanticError("print_char expects a char variable")
            self._move_to(cell, state)
            state.output.append(".")
            self._move_to(0, state)
        elif isinstance(stmt, PrintNum):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type != VarType.NUM:
                raise SemanticError("print_num expects a numeric variable")
            self._emit_print_num(cell, state)
        elif isinstance(stmt, PrintDec):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type != VarType.NUM:
                raise SemanticError("print_dec expects a numeric variable")
            self._emit_print_dec(cell, state)
        elif isinstance(stmt, InputChar):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type != VarType.CHAR:
                raise SemanticError("input_char expects a char variable")
            self._move_to(cell, state)
            state.output.append(",")
            self._move_to(0, state)
        elif isinstance(stmt, InputNum):
            cell, var_type = self._get_var(stmt.name, state)
            if var_type != VarType.NUM:
                raise SemanticError("input_num expects a numeric variable")
            self._move_to(cell, state)
            state.output.append(",")
            self._move_to(0, state)
        elif isinstance(stmt, If):
            self._emit_if(stmt, state)
        elif isinstance(stmt, For):
            self._emit_for(stmt, state)
        else:
            raise SemanticError(f"Unhandled statement type: {stmt}")

    def _emit_if(self, stmt: If, state: CodeGenState) -> None:
        condition_cell, _ = self._get_var(stmt.condition, state)
        cond_copy = self._get_scratch_cell(state, condition_cell)
        zero_flag = self._get_scratch_cell(state, condition_cell, cond_copy)
        # Prepare scratch cells
        self._zero_cell(cond_copy, state)
        self._zero_cell(zero_flag, state)
        self._copy_cell(condition_cell, cond_copy, state)
        self._increment_cell(zero_flag, 1, state)

        # True branch when condition non-zero
        self._move_to(cond_copy, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(zero_flag, state)
        state.output.append("[-]")
        self._emit_block(stmt.true_block, state)
        self._move_to(cond_copy, state)
        state.output.append("]")

        if stmt.false_block:
            # Else block runs if zero_flag remains 1
            self._move_to(zero_flag, state)
            state.output.append("[")
            state.output.append("-")
            self._emit_block(stmt.false_block, state)
            self._move_to(zero_flag, state)
            state.output.append("]")
        else:
            self._zero_cell(zero_flag, state)

        # Clean up scratch cells
        self._zero_cell(cond_copy, state)
        self._zero_cell(zero_flag, state)
        self._move_to(0, state)

    def _emit_block(self, statements: List[Statement], state: CodeGenState) -> None:
        for stmt in statements:
            self._emit_statement(stmt, state)
        self._move_to(0, state)

    def _emit_print_num(self, cell: int, state: CodeGenState) -> None:
        self._move_to(cell, state)
        state.output.append(".")
        self._move_to(0, state)

    def _print_digit(self, digit_cell: int, state: CodeGenState) -> None:
        self._increment_cell(digit_cell, 48, state)
        self._move_to(digit_cell, state)
        state.output.append(".")
        self._increment_cell(digit_cell, -48, state)
        self._move_to(0, state)

    def _emit_print_dec(self, cell: int, state: CodeGenState) -> None:
        work = self._allocate_cell(state)
        self._zero_cell(work, state)
        self._copy_cell(cell, work, state)

        hundreds = self._allocate_cell(state)
        self._zero_cell(hundreds, state)
        self._copy_cell(work, hundreds, state)
        self._divide_literal(hundreds, 100, state)

        remainder = self._allocate_cell(state)
        self._zero_cell(remainder, state)
        self._copy_cell(work, remainder, state)

        temp = self._allocate_cell(state)
        self._zero_cell(temp, state)
        self._copy_cell(hundreds, temp, state)
        self._multiply_literal(temp, 100, state)
        self._transfer_subtract(temp, remainder, state)
        self._zero_cell(temp, state)

        tens = self._allocate_cell(state)
        self._zero_cell(tens, state)
        self._copy_cell(remainder, tens, state)
        self._divide_literal(tens, 10, state)

        temp = self._allocate_cell(state)
        self._zero_cell(temp, state)
        self._copy_cell(tens, temp, state)
        self._multiply_literal(temp, 10, state)
        self._transfer_subtract(temp, remainder, state)
        self._zero_cell(temp, state)

        ones = remainder

        printed_flag = self._allocate_cell(state)
        self._zero_cell(printed_flag, state)

        hundreds_copy = self._allocate_cell(state)
        self._zero_cell(hundreds_copy, state)
        self._copy_cell(hundreds, hundreds_copy, state)
        self._move_to(hundreds_copy, state)
        state.output.append("[")
        self._move_to(hundreds_copy, state)
        state.output.append("-")
        self._print_digit(hundreds, state)
        self._set_cell(printed_flag, 1, state)
        self._move_to(hundreds_copy, state)
        state.output.append("[-]")
        self._move_to(hundreds_copy, state)
        state.output.append("]")
        self._zero_cell(hundreds_copy, state)

        should_print_tens = self._allocate_cell(state)
        self._zero_cell(should_print_tens, state)
        self._copy_cell(printed_flag, should_print_tens, state)

        tens_copy = self._allocate_cell(state)
        self._zero_cell(tens_copy, state)
        self._copy_cell(tens, tens_copy, state)
        self._move_to(tens_copy, state)
        state.output.append("[")
        self._move_to(tens_copy, state)
        state.output.append("-")
        self._set_cell(should_print_tens, 1, state)
        self._move_to(tens_copy, state)
        state.output.append("[-]")
        self._move_to(tens_copy, state)
        state.output.append("]")
        self._zero_cell(tens_copy, state)

        self._move_to(should_print_tens, state)
        state.output.append("[")
        self._move_to(should_print_tens, state)
        state.output.append("-")
        self._print_digit(tens, state)
        self._set_cell(printed_flag, 1, state)
        self._move_to(should_print_tens, state)
        state.output.append("]")
        self._zero_cell(should_print_tens, state)

        self._print_digit(ones, state)

        self._zero_cell(hundreds, state)
        self._zero_cell(tens, state)
        self._zero_cell(ones, state)
        self._zero_cell(work, state)
        self._zero_cell(printed_flag, state)
        self._move_to(0, state)
    def _emit_for(self, stmt: For, state: CodeGenState) -> None:
        target_cell, var_type = self._get_var(stmt.name, state)
        if var_type != VarType.NUM:
            raise SemanticError("for loop iterator must be numeric")
        start_expr, end_expr = stmt.start, stmt.end
        if self._expr_type(start_expr, state) != VarType.NUM or self._expr_type(end_expr, state) != VarType.NUM:
            raise SemanticError("for loop bounds must be numeric")
        self._assign_expr(target_cell, VarType.NUM, start_expr, state)
        # iteration bookkeeping
        iter_cell = self._allocate_cell(state)
        start_copy = self._allocate_cell(state)
        self._assign_expr(iter_cell, VarType.NUM, end_expr, state)
        self._zero_cell(start_copy, state)
        self._copy_cell(target_cell, start_copy, state)
        self._move_to(start_copy, state)
        state.output.append("[")
        state.output.append("-")
        self._move_to(iter_cell, state)
        state.output.append("-")
        self._move_to(start_copy, state)
        state.output.append("]")
        # iter_cell now holds (end - start)
        self._move_to(iter_cell, state)
        state.output.append("[")
        state.output.append("-")
        self._emit_block(stmt.body, state)
        self._increment_cell(target_cell, 1, state)
        self._move_to(iter_cell, state)
        state.output.append("]")
        self._move_to(0, state)

__all__ = [
    "BrainfuckTranspiler",
    "Parser",
    "ParseError",
    "SemanticError",
    "VarType",
]
