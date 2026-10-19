# Label normalization

`normalize_label(text)` accepts a Python string and returns
`text.strip().lower()`: it removes leading and trailing whitespace, then
converts letters to lowercase. Internal whitespace, including repeated spaces,
tabs, and newlines, is preserved.

Examples (using Python string literals):

| Input | Output |
| --- | --- |
| `"  MiXeD Label\t"` | `"mixed label"` |
| `""` | `""` |
| `" \t\n "` | `""` |
| `"  FIRST  Second\tTHIRD  "` | `"first  second\tthird"` |

The implementation and unittest coverage are proposed separately in
[PR #4](https://github.com/argonism/tabgroup-sync/pull/4). This notes branch is
based directly on `stewrd-validation/20261019` and can be reviewed independently.

Run the normalization tests from the repository root after checking out the
implementation branch:

```sh
python3 -m unittest discover -s stewrd_validation -p "test_*.py" -v
```
