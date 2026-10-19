import unittest

from claude_label import normalize_label


class NormalizeLabelTest(unittest.TestCase):
    def test_strips_surrounding_spaces(self):
        self.assertEqual(normalize_label("  bug  "), "bug")

    def test_strips_surrounding_tabs(self):
        self.assertEqual(normalize_label("\tbug\t"), "bug")

    def test_strips_surrounding_newlines(self):
        self.assertEqual(normalize_label("\nbug\r\n"), "bug")

    def test_strips_mixed_surrounding_whitespace(self):
        self.assertEqual(normalize_label(" \t\n bug \n\t "), "bug")

    def test_lowercases_mixed_case(self):
        self.assertEqual(normalize_label("FeAtUrE"), "feature")

    def test_lowercases_and_strips_together(self):
        self.assertEqual(normalize_label("\t Needs Review \n"), "needs review")

    def test_already_normalized_is_unchanged(self):
        self.assertEqual(normalize_label("good first issue"), "good first issue")

    def test_is_idempotent(self):
        once = normalize_label("  Help Wanted\n")
        self.assertEqual(normalize_label(once), once)

    def test_empty_string(self):
        self.assertEqual(normalize_label(""), "")

    def test_whitespace_only_string(self):
        for text in (" ", "   ", "\t", "\n", " \t\r\n "):
            with self.subTest(text=text):
                self.assertEqual(normalize_label(text), "")

    def test_preserves_internal_whitespace(self):
        self.assertEqual(normalize_label("  Needs  Triage\tNow  "), "needs  triage\tnow")

    def test_preserves_internal_newline(self):
        self.assertEqual(normalize_label("\nLine One\nLine Two\n"), "line one\nline two")


if __name__ == "__main__":
    unittest.main()
