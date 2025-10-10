import unittest

from tinybf import BrainfuckInterpreter, ExecutionState, VisualizerSession
from tinybf.bf_interpreter import StepLimitExceeded
from tinybf.visualizer import _format_code_window, _to_input_bytes, format_state


class BrainfuckInterpreterStepTests(unittest.TestCase):
    def test_step_sequence_produces_states(self) -> None:
        interpreter = BrainfuckInterpreter()
        program = "+++."
        states = list(interpreter.step(program, tape_window=2))
        commands = [state.command for state in states[:-1]]  # 最終状態は command=None
        self.assertEqual(commands, ["+", "+", "+", "."])
        self.assertEqual(states[-1].output, states[-2].output)
        self.assertEqual(states[-1].pc, len(program))

    def test_step_limit(self) -> None:
        interpreter = BrainfuckInterpreter()
        program = "+[]"
        stepper = interpreter.step(program, max_steps=4)
        with self.assertRaises(StepLimitExceeded):
            while True:
                next(stepper)


class VisualizerSessionTests(unittest.TestCase):
    def test_basic_stepping(self) -> None:
        session = VisualizerSession("+++.", input_template=[], tape_window=2, max_steps=100)
        initial = session.current_state()
        self.assertIsNone(initial.command)
        states = session.step_forward(2)
        self.assertEqual(len(states), 2)
        self.assertEqual(states[-1].step, 2)
        self.assertFalse(session.is_finished())

    def test_breakpoint(self) -> None:
        session = VisualizerSession("+++." , input_template=[], tape_window=2, max_steps=100)
        session.add_breakpoint(2)
        session.run_until_break()
        self.assertEqual(session.hit_breakpoint, 2)
        self.assertEqual(session.current_state().pc, 2)

    def test_restart(self) -> None:
        session = VisualizerSession("+.", input_template=[], tape_window=2, max_steps=100)
        session.step_forward(3)
        self.assertTrue(session.is_finished())
        session.restart()
        self.assertFalse(session.is_finished())
        self.assertEqual(session.current_state().step, 0)


class VisualizerSessionAdvancedTests(unittest.TestCase):
    def test_step_forward_zero_count_keeps_state(self) -> None:
        session = VisualizerSession("++", input_template=[], history_limit=5)
        initial_state = session.current_state()
        states = session.step_forward(0)
        self.assertEqual(states, [])
        self.assertIs(session.current_state(), initial_state)
        self.assertFalse(session.is_finished())
        self.assertIsNone(session.hit_breakpoint)

    def test_step_forward_stops_on_breakpoint(self) -> None:
        session = VisualizerSession("+++.>", input_template=[], max_steps=100)
        session.add_breakpoint(2)
        states = session.step_forward(10)
        self.assertTrue(states)
        self.assertEqual(session.hit_breakpoint, 2)
        self.assertEqual(states[-1].pc, 2)
        self.assertFalse(session.is_finished())

    def test_run_until_break_limit(self) -> None:
        session = VisualizerSession("+++++.", input_template=[], max_steps=100)
        session.add_breakpoint(5)
        states = session.run_until_break(limit=2)
        self.assertEqual(len(states), 2)
        self.assertIsNone(session.hit_breakpoint)
        self.assertEqual(session.current_state(), states[-1])
        self.assertFalse(session.is_finished())

    def test_run_until_break_hits_breakpoint(self) -> None:
        session = VisualizerSession("+++.>", input_template=[], max_steps=100)
        session.add_breakpoint(3)
        states = session.run_until_break()
        self.assertTrue(states)
        self.assertEqual(session.hit_breakpoint, 3)
        self.assertEqual(states[-1].pc, 3)
        self.assertFalse(session.is_finished())

    def test_run_until_break_propagates_step_limit(self) -> None:
        session = VisualizerSession("+[]", input_template=[], max_steps=2)
        with self.assertRaises(StepLimitExceeded):
            session.run_until_break()

    def test_history_limit_discards_old_entries(self) -> None:
        session = VisualizerSession("+++++.", input_template=[], history_limit=3, max_steps=100)
        session.step_forward(5)
        self.assertEqual(len(session.history), 3)
        self.assertGreater(session.history[0].step, 0)
        self.assertEqual(session.history[-1], session.current_state())

    def test_breakpoint_management_helpers(self) -> None:
        session = VisualizerSession("+++.", input_template=[])
        session.add_breakpoint(3)
        session.add_breakpoint(1)
        self.assertEqual(session.list_breakpoints(), [1, 3])
        self.assertTrue(session.remove_breakpoint(1))
        self.assertFalse(session.remove_breakpoint(99))
        session.clear_breakpoints()
        self.assertEqual(session.list_breakpoints(), [])


class VisualizerUtilityTests(unittest.TestCase):
    def test_to_input_bytes(self) -> None:
        self.assertEqual(_to_input_bytes("Az0"), [65, 122, 48])

    def test_format_code_window_marks_end(self) -> None:
        self.assertEqual(_format_code_window("+", 5), "+[END]")

    def test_format_state_renders_core_sections(self) -> None:
        state = ExecutionState(
            step=3,
            pc=1,
            command="+",
            pointer=1,
            tape_start=0,
            tape=[1, 2, 3],
            output="A",
            code_length=3,
        )
        rendered = format_state(state, "++.")
        self.assertIn("step=3 pc=1/3 command='+' pointer=1", rendered)
        self.assertIn("output='A'", rendered)
        self.assertIn("[1:002]", rendered)
        self.assertIn("code=+[+].", rendered)


if __name__ == "__main__":
    unittest.main()
