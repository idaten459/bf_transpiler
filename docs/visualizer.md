# TinyBF Visualizer

TinyBF programs can now be inspected step-by-step using the embedded Brainfuck visualizer. The tool transpiles TinyBF to Brainfuck, executes it with a step-aware interpreter, and provides a command-line REPL to explore the program state.

## Launching

```bash
python -m tinybf.visualizer path/to/program.tbf
```

Key options:

- `--input TEXT` – provide an input string for the Brainfuck program.
- `--brainfuck` – treat the source file as raw Brainfuck instead of TinyBF.
- `--max-steps N` – maximum execution steps before aborting (default: 5,000,000).
- `--tape-window W` – number of cells shown to the left and right of the pointer.
- `--history-limit N` – number of snapshot states kept in history.

## Commands

Within the REPL you can type:

- `next [N]` – advance by one (or *N*) Brainfuck instructions.
- `run [N]` – continue until a breakpoint or *N* additional steps.
- `state` – display the current execution snapshot (PC, command, tape view, output).
- `history [N]` – list the last *N* snapshots stored in history.
- `break PC` – add a breakpoint at Brainfuck instruction index *PC*.
- `breaks` – list current breakpoints.
- `clear [PC]` – remove the breakpoint at *PC*, or all if omitted.
- `restart` – reset the interpreter and start from the beginning.
- `quit` / `exit` – leave the visualizer.
- `help` – show command summary.

Snapshots highlight the current cell, output buffer, and snippet of Brainfuck code around the current program counter. When a breakpoint is hit, execution pauses automatically.

## Step Limit

To avoid infinite loops, the visualizer enforces the interpreter’s step budget. When the limit is exceeded a `StepLimitExceeded` message is shown and execution stops. Adjust `--max-steps` when necessary.

## Examples

Inspect a TinyBF multiplication example:

```bash
python -m tinybf.visualizer examples/sum_two_digits.tbf --run
```

View raw Brainfuck:

```bash
python -m tinybf.visualizer hello.bf --brainfuck --tape-window 5
```

Use breakpoints:

```bash
(viz) break 42
(viz) run
```

This stops execution when the next instruction index is 42. Use `state` to inspect and `next` to continue stepping.
