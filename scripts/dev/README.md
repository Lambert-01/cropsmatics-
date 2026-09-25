# Dev scripts

Local-development conveniences that are not part of CI. Keep these small and
side-effect-light; anything destructive belongs in a clearly named target.

Planned:
- `seed_demo.py` — load `data/dev_fixtures/synthetic/*` into a local database
  for UI demos (clearly labelled SYNTHETIC).
- `smoke_api.py` — hit `/health` and `/api/v1/meta` after `make api`.
