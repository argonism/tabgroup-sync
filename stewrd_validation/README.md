# stewrd acceptance fixtures

This directory is used only on the `stewrd-validation/20261019` validation base and stewrd Worker branches. It does not change the extension. Do not merge validation PRs into the default main branch or create releases.

Workers implement small Python standard-library fixtures here and validate them with:

```
python3 -m unittest discover -s stewrd_validation -p 'test_*.py' -v
```

The repository owner has authorized acceptance PRs, review comments, intentional CI failures, pushes, and merge/close operations only in this repository. Review events still permit proposals only. Preserve branch ownership and report results through stewrd.
