# TinyBF Transpiler Language Design

## Goals
- Provide a minimal, structured syntax that can transpile deterministically to Brainfuck.
- Support the following high-level constructs:
  - Distinct numeric (`num`) and character (`char`) variables living on the Brainfuck tape
  - Integer arithmetic (addition and subtraction with constants or other variables)
  - Simple conditional branching with optional else clauses
  - Deterministic counted loops ("for" loops)
- Remain close to Brainfuck's data model (byte-oriented tape) to keep code generation straightforward.

## Memory Model
- Brainfuck tape cells are treated as unsigned bytes (0-255) with wrap-around semantics.
- Cells `0`, `1`, and `2` are reserved for the transpiler (`0` as the "home" position, `1`/`2` as scratch space).
- User-declared variables start at cell `3` and are allocated sequentially. Variables never move after allocation.
- The transpiler keeps the Brainfuck data pointer parked on cell `0` between statements.

## Program Structure
A program is a sequence of statements separated by newlines. Blank lines and lines starting with `#` are ignored as comments.

```
program := { statement NEWLINE }
```

### Literals and identifiers
- `IDENT` starts with a letter and may include letters, digits, or `_`.
- `NUMBER` is a non-negative integer literal (base 10) within `0-255`.
- `CHAR` literals use single quotes: `'A'`, `'\n'`, ` '\\'`, etc. Supported escapes: `\0`, `\n`, `\r`, `\t`, `\\`, `\'`, `\"`.

## Statements

### Variable declaration
```
let num IDENT = expr
let char IDENT = expr
```
Allocates a new variable (or reuses an existing one of the same type) and assigns the given expression. `expr` can be a literal or existing identifier. Numeric and character values may be assigned interchangeably because both occupy a single byte.

### Assignment
```
set IDENT = expr
```
Evaluates `expr` into the target variable. Assignments support implicit conversion between `num` and `char` since both map to a byte value.

### Arithmetic updates
```
add IDENT expr
sub IDENT expr
mul IDENT operand
div IDENT literal
```
`expr` in `add`/`sub` can be a literal or identifier of type `num` or `char`. `mul` accepts either a literal or identifier (types `num`/`char`) and multiplies the target in-place. `div` performs integer division by a literal or identifier (types `num`/`char`) and stores the quotient in the target; dividing by zero yields zero without raising an error. The target for `mul`/`div` must be numeric (`num`), while `mul` also accepts `char` targets. All operations use wrap-around semantics modulo 256.

### I/O
```
print_char IDENT   # Emit the ASCII character stored in IDENT
print_num IDENT    # Emit the raw byte value stored in IDENT (0-255)
print_dec IDENT    # Emit the decimal digits of IDENT (0-255)
input_char IDENT   # Read a byte from STDIN into IDENT (0 if exhausted)
input_num IDENT    # Read a byte from STDIN into IDENT (0 if exhausted)
```
`print_num` currently writes the stored byte directly (no decimal conversion). To display decimal digits, convert the value to characters within TinyBF (e.g., by adding `'0'` for single-digit values).
`print_dec` performs an internal conversion and prints the decimal representation without leading zeros (except for zero itself).

### Conditionals
```
if IDENT {
    ...
}
else {
    ...
}
```
- Executes the first block when IDENT is non-zero. Otherwise the optional `else` block runs.
- IDENT is restored to its original value after the conditional (unless mutated inside the block by user code). Either numeric or character variables may be used as the condition.

### Loops
```
for IDENT from expr to expr {
    ...
}
```
- Initializes IDENT to the evaluated start expression.
- Repeats the block while IDENT is not equal to the end expression, incrementing IDENT by 1 after each iteration.
- The loop variable and both bounds must be numeric expressions.
- Loop variable is restored to the value it holds after the final increment.

### Expressions
```
expr := NUMBER | CHAR | IDENT
```
Expressions are limited to a single literal or variable to keep code generation simple and predictable.

## Scoping Rules
- All variables have global scope.
- Loop and conditional blocks may introduce new statements and variable declarations.
- Variables must be declared with `let` before first use.

## Error Handling
The transpiler validates:
- Undefined identifiers raise a transpilation error.
- Numeric literal overflow (outside 0-255) raises an error.

## Example Program
```
# Hello followed by a counter
let char ch = 'H'
print_char ch
add ch 1
print_char ch
add ch 7
print_char ch
sub ch 4

let num counter = 0
let char ascii_zero = '0'
for counter from 0 to 3 {
    let char digit = '0'
    set digit = counter
    add digit ascii_zero
    print_char digit
}
```

## CLI Usage
Run the transpiler and optional interpreter via the bundled CLI:

```
python -m tinybf path/to/program.tbf              # Emit Brainfuck to stdout
python -m tinybf path/to/program.tbf --emit out.bf
python -m tinybf path/to/program.tbf --run --input "data"
```

`--run` executes the generated Brainfuck using the bundled interpreter and writes the program output to STDOUT.
