import unittest

from codex_label import normalize_label


class NormalizeLabelTests(unittest.TestCase):
    def test_trims_surrounding_whitespace(self):
        self.assertEqual(normalize_label(" \t\n Label \r\n\t "), "label")

    def test_lowercases_mixed_case(self):
        self.assertEqual(normalize_label("MiXeD CaSe"), "mixed case")

    def test_empty_string(self):
        self.assertEqual(normalize_label(""), "")

    def test_whitespace_only_strings(self):
        for text in (" ", "\t", "\n", " \t\r\n "):
            with self.subTest(text=text):
                self.assertEqual(normalize_label(text), "")

    def test_preserves_internal_whitespace(self):
        self.assertEqual(
            normalize_label("  FIRST  Second\tTHIRD\nFourth  "),
            "first  second\tthird\nfourth",
        )

    def test_normalized_label_is_unchanged(self):
        self.assertEqual(normalize_label("already normalized"), "already normalized")


if __name__ == "__main__":
    unittest.main()
