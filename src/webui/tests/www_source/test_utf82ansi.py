"""Tests for www_source/utf82ansi.py (run: python3 -I -m unittest discover -s src/webui/tests/www_source)."""
import os, subprocess, sys, tempfile, unittest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "www_source", "utf82ansi.py")


def run(data):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "f.txt")
        with open(path, "wb") as f:
            f.write(data)
        p = subprocess.run([sys.executable, "-I", SCRIPT, path], capture_output=True, text=True)
        with open(path, "rb") as f:
            return p.returncode, p.stderr, f.read()


class Utf82Ansi(unittest.TestCase):
    def test_latin1_characters_are_converted(self):
        rc, err, out = run("Büro Größe é\n".encode("utf-8"))
        self.assertEqual((rc, out), (0, "Büro Größe é\n".encode("iso-8859-1")))

    def test_ascii_and_line_endings_are_preserved(self):
        rc, err, out = run(b"a\r\nb\nc")
        self.assertEqual((rc, out), (0, b"a\r\nb\nc"))

    def test_invalid_utf8_fails_and_names_the_position(self):
        rc, err, out = run(b"ok\nbad \xe4 byte\n")
        self.assertEqual(rc, 1)
        self.assertIn("f.txt:2:5", err)
        self.assertIn("0xe4", err)
        self.assertEqual(out, b"ok\nbad \xe4 byte\n")  # file untouched

    def test_character_outside_latin1_fails_and_names_it(self):
        rc, err, out = run("line1\nsmile € here\n".encode("utf-8"))
        self.assertEqual(rc, 1)
        self.assertIn("f.txt:2:7", err)
        self.assertIn("U+20AC", err)
        self.assertEqual(out, "line1\nsmile € here\n".encode("utf-8"))  # file untouched

    def test_byte_order_mark_fails_instead_of_vanishing(self):
        rc, err, out = run("﻿x".encode("utf-8"))
        self.assertEqual(rc, 1)
        self.assertIn("U+FEFF", err)


if __name__ == "__main__":
    unittest.main()
