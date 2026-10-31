#!/usr/bin/python

# Re-encode a generated UTF-8 file to ISO-8859-1 in place (the CCU serves these files as Latin-1).
#
# This used to drop every byte that is not valid UTF-8 and every character outside Latin-1 without
# a word. It now fails and names the file, line, column and character instead, so a source file
# with a wrong encoding or a character that Latin-1 cannot hold breaks the build and not the UI.

import sys

fileName = sys.argv[1]

with open(fileName, "rb") as f:
    data = f.read()


def line_col(text, pos):
    line = text.count("\n", 0, pos) + 1
    return line, pos - (text.rfind("\n", 0, pos) + 1) + 1


try:
    text = data.decode("utf-8")
except UnicodeDecodeError as e:
    head = data[:e.start]
    line = head.count(b"\n") + 1
    col = e.start - (head.rfind(b"\n") + 1) + 1
    sys.exit("utf82ansi: %s:%d:%d: not valid UTF-8 (byte 0x%02x); a source file has the wrong encoding"
             % (fileName, line, col, data[e.start]))

try:
    out = text.encode("iso-8859-1")
except UnicodeEncodeError as e:
    line, col = line_col(text, e.start)
    sys.exit("utf82ansi: %s:%d:%d: character U+%04X %r cannot be represented in ISO-8859-1"
             % (fileName, line, col, ord(text[e.start]), text[e.start]))

with open(fileName, "wb") as f:
    f.write(out)
