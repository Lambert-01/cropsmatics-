# 21. Developer Setup

## Prerequisites
Node 20+, pnpm, Python 3.11+, PostgreSQL/PostGIS, Expo Go or emulator.

### Web
```bash
cd apps/web
pnpm install
pnpm dev
```

### Mobile
```bash
cd apps/mobile
pnpm install
npx expo start
```

### API
```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
