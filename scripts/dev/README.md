# Dev scripts

Local-development conveniences that are not part of CI. Keep these small and
side-effect-light; anything destructive belongs in a clearly named target.

Available/planned:
- `smoke_api.py` — hit `/health` and `/api/v1/meta` after `make api`.

There is no bundled demo dataset. Use the real processed outputs produced by
`make data`; test-only records belong in temporary test fixtures.
