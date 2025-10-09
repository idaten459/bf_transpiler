import unittest

from tinybf import BrainfuckInterpreter, ExecutionState, VisualizerSession
from tinybf.bf_interpreter import StepLimitExceeded


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


if __name__ == "__main__":
    unittest.main()
