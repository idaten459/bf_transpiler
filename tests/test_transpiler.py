from pathlib import Path
import tempfile
from contextlib import redirect_stderr, redirect_stdout
import io
import unittest

from tinybf import BrainfuckInterpreter, BrainfuckTranspiler, ParseError, SemanticError
from tinybf.cli import main as cli_main


class BrainfuckInterpreterTests(unittest.TestCase):
    def test_simple_output(self) -> None:
        interpreter = BrainfuckInterpreter()
        program = "+" * 65 + "."
        output = interpreter.run(program)
        self.assertEqual(output, "A")


class TranspilerIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.interpreter = BrainfuckInterpreter()
        self.transpiler = BrainfuckTranspiler()

    def transpile_and_run(self, source: str) -> str:
        brainfuck = self.transpiler.transpile(source)
        return self.interpreter.run(brainfuck)

    def test_literal_output(self) -> None:
        source = """
        let char ch = 'A'
        print_char ch
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "A")

    def test_add_and_sub_literals(self) -> None:
        source = """
        let char ch = '<'
        add ch 5
        sub ch 1
        print_char ch
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "@")

    def test_add_from_variable(self) -> None:
        source = """
        let char a = '('
        let num b = 25
        add a b
        print_char a
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "A")

    def test_set_from_variable(self) -> None:
        source = """
        let char a = 'A'
        let char b = '\\0'
        set b = a
        print_char b
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "A")

    def test_print_num_outputs_raw_byte(self) -> None:
        source = """
        let num value = 65
        print_num value
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "A")

    def test_mul_with_literal(self) -> None:
        source = """
        let char value = '!'
        mul value 2
        print_char value
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "B")

    def test_div_with_literal(self) -> None:
        source = """
        let num value = 10
        div value 3
        let char digit = '0'
        set digit = value
        add digit '0'
        print_char digit
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "3")

    def test_print_dec_outputs_decimal(self) -> None:
        source = """
        let num value = 205
        print_dec value
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "205")

    def test_print_dec_single_digit(self) -> None:
        source = """
        let num value = 7
        print_dec value
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "7")

    def test_if_executes_when_truthy(self) -> None:
        source = """
        let num flag = 1
        let char ch = 'A'
        if flag {
            print_char ch
        }
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "A")

    def test_if_skips_when_zero(self) -> None:
        source = """
        let num flag = 0
        let char ch = 'A'
        if flag {
            print_char ch
        }
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "")

    def test_if_executes_else_when_zero(self) -> None:
        source = """
        let num flag = 0
        let char ch = 'A'
        let char alt = 'B'
        if flag {
            print_char ch
        }
        else {
            print_char alt
        }
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "B")

    def test_if_restores_condition_value(self) -> None:
        source = """
        let num flag = 1
        if flag {
            # no-op
        }
        let char base = 'A'
        add base flag
        print_char base
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "B")

    def test_for_loop_runs_expected_iterations(self) -> None:
        source = """
        let num counter = 0
        let char ch = 'A'
        for counter from 0 to 3 {
            print_char ch
            add ch 1
        }
        """
        output = self.transpile_and_run(source)
        self.assertEqual(output, "ABC")


class TranspilerErrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.transpiler = BrainfuckTranspiler()

    def test_undefined_variable(self) -> None:
        program = "print_char missing"
        with self.assertRaises(SemanticError):
            self.transpiler.transpile(program)

    def test_invalid_literal(self) -> None:
        program = "let num value = 300"
        with self.assertRaises(ParseError):
            self.transpiler.transpile(program)

    def test_division_by_zero_literal_raises(self) -> None:
        program = """
        let num value = 10
        div value 0
        """
        with self.assertRaises(SemanticError):
            self.transpiler.transpile(program)


class CLITests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write_source(self, content: str, name: str = "program.tbf") -> Path:
        path = self.tmp_path / name
        path.write_text(content.strip() + "\n", encoding="utf-8")
        return path

    def test_cli_emits_brainfuck_file(self) -> None:
        content = """
        let char ch = 'A'
        print_char ch
        """
        source_path = self._write_source(content)
        output_path = self.tmp_path / "out.bf"
        exit_code = cli_main([str(source_path), "--emit", str(output_path)])
        self.assertEqual(exit_code, 0)
        emitted = output_path.read_text(encoding="utf-8")
        source_text = source_path.read_text(encoding="utf-8")
        expected = BrainfuckTranspiler().transpile(source_text)
        self.assertEqual(emitted, expected)

    def test_cli_run_outputs_program_result(self) -> None:
        content = """
        let char ch = 'A'
        print_char ch
        """
        source_path = self._write_source(content)
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            exit_code = cli_main([str(source_path), "--run"])
        self.assertEqual(exit_code, 0)
        self.assertEqual(buffer.getvalue(), "A")

    def test_cli_missing_file_errors(self) -> None:
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            exit_code = cli_main(["does_not_exist.tbf"])
        self.assertEqual(exit_code, 1)
        self.assertIn("Source file not found", buffer.getvalue())

if __name__ == "__main__":
    unittest.main()
