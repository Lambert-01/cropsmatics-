#!/usr/bin/env bash
#
# Cropmatics Rwanda — local development runner.
#
# Starts the API, the web app and the Expo mobile app, with the database
# migration/load steps in one place so a fresh clone can be brought up without
# guessing commands.
#
# Usage:
#   ./scripts/dev.sh setup            # install deps, migrate, load tables
#   ./scripts/dev.sh api              # FastAPI on :8000 (bound to 0.0.0.0)
#   ./scripts/dev.sh web              # Next.js on :3000
#   ./scripts/dev.sh mobile           # Expo, pointed at this machine's LAN IP
#   ./scripts/dev.sh mobile --emulator  # Expo, pointed at the Android emulator
#   ./scripts/dev.sh all              # api + web here, prints the mobile command
#   ./scripts/dev.sh stop             # stop anything this script started
#   ./scripts/dev.sh status           # what is running / reachable
#   ./scripts/dev.sh migrate          # alembic upgrade head
#   ./scripts/dev.sh load             # load processed CSVs into PostgreSQL
#   ./scripts/dev.sh verify           # end-to-end smoke test of the stack
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_DIR="$ROOT/services/api"
VENV_PY="$API_DIR/.venv/bin/python"
RUN_DIR="$ROOT/.dev-run"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
EXPO_PORT="${EXPO_PORT:-8081}"

# ---------------------------------------------------------------- output ----
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi
info()  { printf '%s==>%s %s\n' "$BLUE" "$RESET" "$*"; }
ok()    { printf '%s  ok%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '%s  !!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail()  { printf '%s  xx%s %s\n' "$RED" "$RESET" "$*" >&2; }
die()   { fail "$*"; exit 1; }

# ------------------------------------------------------------- utilities ----
# Local IPv4 address, used so a physical phone can reach the API. `localhost`
# inside the Expo app resolves to the phone itself, which is a common trap.
lan_ip() {
  local ip
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  done
  # Linux / fallback
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  printf '127.0.0.1'
}

need_env_file() {
  if [ ! -f "$ROOT/.env" ]; then
    warn "no .env found — creating one from .env.example"
    cp "$ROOT/.env.example" "$ROOT/.env"
    warn "edit $ROOT/.env and set DATABASE_URL + JWT_SECRET, then re-run"
    exit 1
  fi
  # Surface a placeholder rather than failing later with an opaque driver error.
  if grep -q '^DATABASE_URL=postgresql+psycopg://cropmatics:cropmatics@localhost' "$ROOT/.env"; then
    warn "DATABASE_URL in .env is still the placeholder value"
  fi
  if grep -q '^JWT_SECRET=replace-me' "$ROOT/.env"; then
    warn "JWT_SECRET in .env is still the placeholder value"
  fi
}

need_venv() {
  [ -x "$VENV_PY" ] || die "API venv missing. Run: ./scripts/dev.sh setup"
}

need_node_modules() {
  [ -d "$ROOT/node_modules" ] || die "JS deps missing. Run: ./scripts/dev.sh setup"
}

pnpmx() { corepack pnpm "$@"; }

wait_for_http() {
  local url="$1" name="$2" tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then ok "$name reachable"; return 0; fi
    sleep 1
  done
  fail "$name did not come up at $url"
  return 1
}

# Start a long-running process detached from this script.
#
# Output MUST go to a log file rather than to our stdout: an inherited pipe is
# never closed by the child, so any shell pipeline reading our output would hang
# forever waiting for EOF. `disown` keeps this script's exit from signalling the
# child. The pid file is used by `stop`.
start_bg() {
  local name="$1" workdir="$2"; shift 2
  mkdir -p "$RUN_DIR"
  local log="$RUN_DIR/$name.log"
  ( cd "$workdir" && exec "$@" ) > "$log" 2>&1 &
  local pid=$!
  echo "$pid" > "$RUN_DIR/$name.pid"
  disown "$pid" 2>/dev/null || true
  printf '%s' "$pid"
}

# Stop one background process, including any children it spawned (uvicorn
# --reload, next dev and expo all fork a worker).
stop_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.3
  done
  pkill -KILL -P "$pid" 2>/dev/null || true
  kill -KILL "$pid" 2>/dev/null || true
  return 0
}

is_running() { [ -f "$RUN_DIR/$1.pid" ] && kill -0 "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null; }

# ------------------------------------------------------------- subcommands ----
cmd_setup() {
  need_env_file

  info "installing JS workspaces (pnpm install --frozen-lockfile)"
  pnpmx install --frozen-lockfile

  if [ ! -x "$VENV_PY" ]; then
    info "creating API virtualenv"
    python3 -m venv "$API_DIR/.venv"
  fi
  info "installing API dependencies"
  "$API_DIR/.venv/bin/pip" install --quiet --upgrade pip
  "$API_DIR/.venv/bin/pip" install --quiet \
    -r "$API_DIR/requirements.txt" -r "$API_DIR/requirements-dev.txt"

  cmd_migrate
  cmd_load

  # App-local env files (both git-ignored) so each app talks to the right host.
  local ip; ip="$(lan_ip)"
  [ -f "$ROOT/apps/web/.env.local" ] || {
    printf 'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:%s/api/v1\n' "$API_PORT" \
      > "$ROOT/apps/web/.env.local"
    ok "wrote apps/web/.env.local"
  }
  [ -f "$ROOT/apps/mobile/.env" ] || {
    printf 'EXPO_PUBLIC_API_BASE_URL=http://%s:%s/api/v1\n' "$ip" "$API_PORT" \
      > "$ROOT/apps/mobile/.env"
    ok "wrote apps/mobile/.env (LAN IP $ip)"
  }

  echo
  ok "setup complete"
  printf '  %sAPI   %s http://127.0.0.1:%s/docs\n' "$BOLD" "$RESET" "$API_PORT"
  printf '  %sWeb   %s http://localhost:%s\n'      "$BOLD" "$RESET" "$WEB_PORT"
  printf '  %sMobile%s http://%s:%s  (./scripts/dev.sh mobile)\n' \
    "$BOLD" "$RESET" "$ip" "$EXPO_PORT"
}

cmd_migrate() {
  need_env_file
  need_venv
  info "applying Alembic migrations (upgrade head)"
  ( cd "$API_DIR" && .venv/bin/alembic upgrade head )
  ok "schema up to date"
}

cmd_load() {
  need_env_file
  need_venv
  info "loading processed CSVs into PostgreSQL"
  if [ ! -f "$ROOT/data/processed/district_crop_productivity.csv" ]; then
    warn "processed data missing — running the pipeline first"
    "$VENV_PY" "$ROOT/scripts/data/run_all.py"
  fi
  "$VENV_PY" "$ROOT/scripts/data/load_database.py"
  ok "analytical tables loaded"
}

cmd_api() {
  need_env_file; need_venv
  if is_running api; then warn "API already running (pid $(cat "$RUN_DIR/api.pid"))"; return 0; fi

  info "starting FastAPI on 0.0.0.0:$API_PORT"
  # Bound to 0.0.0.0 (not 127.0.0.1) so a phone on the same Wi-Fi can reach it.
  start_bg api "$API_DIR" .venv/bin/python -m uvicorn app.main:app \
    --host 0.0.0.0 --port "$API_PORT" --reload > /dev/null
  wait_for_http "http://127.0.0.1:$API_PORT/api/v1/health" "API"
  printf '  docs: %shttp://127.0.0.1:%s/docs%s\n' "$BOLD" "$API_PORT" "$RESET"
}

cmd_web() {
  need_env_file; need_node_modules
  if is_running web; then warn "web already running (pid $(cat "$RUN_DIR/web.pid"))"; return 0; fi

  info "starting Next.js on :$WEB_PORT"
  start_bg web "$ROOT/apps/web" corepack pnpm exec next dev -p "$WEB_PORT" > /dev/null
  wait_for_http "http://127.0.0.1:$WEB_PORT" "web" 90
}

cmd_mobile() {
  need_env_file; need_node_modules

  local mode="lan" target ip
  for arg in "$@"; do
    case "$arg" in
      --emulator) mode="emulator" ;;
      --localhost) mode="localhost" ;;
      *) die "unknown mobile option: $arg (use --emulator or --localhost)" ;;
    esac
  done

  case "$mode" in
    emulator)  target="10.0.2.2" ;;   # Android emulator's alias for the host
    localhost) target="127.0.0.1" ;;  # iOS simulator shares the host network
    lan)       target="$(lan_ip)" ;;
  esac
  ip="$target"

  export EXPO_PUBLIC_API_BASE_URL="http://$ip:$API_PORT/api/v1"

  info "starting Expo on :$EXPO_PORT"
  printf '  %sAPI base URL: %s%s\n' "$BOLD" "$EXPO_PUBLIC_API_BASE_URL" "$RESET"
  case "$mode" in
    emulator)  warn "Android emulator mode (10.0.2.2)" ;;
    localhost) warn "iOS simulator / localhost mode" ;;
    lan)       warn "physical device mode — phone and computer must share the Wi-Fi" ;;
  esac

  # Health-check the API first: a wrong base URL is the usual cause of a blank app.
  if ! curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/v1/health"; then
    warn "API is not responding on :$API_PORT — start it with: ./scripts/dev.sh api"
  fi

  cd "$ROOT/apps/mobile"
  exec corepack pnpm exec expo start --port "$EXPO_PORT"
}

cmd_all() {
  cmd_api
  cmd_web
  echo
  ok "API and web are running."
  printf '  %sWeb%s  http://localhost:%s\n' "$BOLD" "$RESET" "$WEB_PORT"
  printf '  %sAPI%s  http://127.0.0.1:%s/docs\n' "$BOLD" "$RESET" "$API_PORT"
  echo
  info "start mobile in a second terminal:"
  printf '    ./scripts/dev.sh mobile\n'
  echo
  info "stop everything with: ./scripts/dev.sh stop"
  wait
}

cmd_stop() {
  local stopped=0 pid f
  for f in "$RUN_DIR"/*.pid; do
    [ -f "$f" ] || continue
    pid="$(cat "$f" 2>/dev/null || true)"
    if stop_pid "$pid"; then
      ok "stopped $(basename "$f" .pid) (pid $pid)"
      stopped=$((stopped + 1))
    fi
    rm -f "$f"
  done
  if [ "$stopped" -gt 0 ]; then
    ok "stopped $stopped process(es)"
  else
    info "nothing to stop"
  fi
}

cmd_status() {
  echo
  printf '%sService%s\n' "$BOLD" "$RESET"
  if curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/v1/health"; then
    ok "API    http://127.0.0.1:$API_PORT  running"
  else
    fail "API    http://127.0.0.1:$API_PORT  not reachable"
  fi
  if curl -sf -o /dev/null "http://127.0.0.1:$WEB_PORT"; then
    ok "Web    http://localhost:$WEB_PORT  running"
  else
    fail "Web    http://localhost:$WEB_PORT  not reachable"
  fi
  printf '  --  Mobile lan IP %s\n' "$(lan_ip)"

  if [ -f "$ROOT/.env" ]; then
    echo
    printf '%sConfig%s\n' "$BOLD" "$RESET"
    # Mask credentials before printing.
    sed -nE 's/^(DATABASE_URL=.*:\/\/[^:]+):[^@]+@/\1:***@/p' "$ROOT/.env" \
      | sed 's/^/  /'
    grep -E '^(NEXT_PUBLIC_API_BASE_URL|EXPO_PUBLIC_API_BASE_URL|ENVIRONMENT)=' \
      "$ROOT/.env" | sed 's/^/  /'
  fi
  echo
}

cmd_verify() {
  need_env_file; need_venv
  local started_api=0
  if ! curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/v1/health"; then
    cmd_api
    started_api=1
  fi
  # Only shut down the API if this command is the thing that started it.
  if [ "$started_api" = "1" ]; then
    trap 'stop_pid "$(cat "$RUN_DIR/api.pid" 2>/dev/null)" >/dev/null 2>&1; rm -f "$RUN_DIR/api.pid"' EXIT
  fi

  local base="http://127.0.0.1:$API_PORT/api/v1"
  echo
  printf '%sEndpoint checks%s\n' "$BOLD" "$RESET"
  local failed=0
  for p in /health /health/readiness /meta/data-version /geography/districts /crops \
           /dashboard/overview /analytics/productivity /analytics/factors \
           /analytics/heatmap /analytics/post-harvest /analytics/storage-infrastructure \
           /analytics/trends /maps/district-metrics /facilities/context \
           /facilities/program-context; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$base$p")"
    if [ "$code" = "200" ]; then
      ok "$(printf '%-38s' "$p") 200"
    else
      fail "$(printf '%-38s' "$p") $code"
      failed=$((failed + 1))
    fi
  done

  echo
  printf '%sReadiness%s\n' "$BOLD" "$RESET"
  curl -s "$base/health/readiness" | "$VENV_PY" -c '
import json, sys

d = json.load(sys.stdin)
datasets = d["datasets"]
rows = d["row_counts"]
checks = [c["check"] for c in d["checks"]]

print("  status   : " + str(d["status"]))
print("  database : " + str(d["database"]))
print("  datasets : {}/{} present".format(sum(datasets.values()), len(datasets)))
print("  training : {} rows".format(rows["training"]))
print("  model    : " + str(d["model"]))
print("  checks   : " + (", ".join(checks) if checks else "none"))
'

  echo
  if [ "$failed" -eq 0 ]; then
    ok "all endpoint checks passed"
  else
    fail "$failed endpoint check(s) failed"
    exit 1
  fi
}

cmd_help() {
  # Print the leading comment banner, stopping at the first line of real code.
  awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"
}

# ------------------------------------------------------------------ main ----
case "${1:-help}" in
  setup)   shift; cmd_setup "$@" ;;
  api)     shift; cmd_api "$@" ;;
  web)     shift; cmd_web "$@" ;;
  mobile)  shift; cmd_mobile "$@" ;;
  all|dev) shift; cmd_all "$@" ;;
  stop)    shift; cmd_stop "$@" ;;
  status)  shift; cmd_status "$@" ;;
  migrate) shift; cmd_migrate "$@" ;;
  load)    shift; cmd_load "$@" ;;
  verify)  shift; cmd_verify "$@" ;;
  help|-h|--help) cmd_help ;;
  *) die "unknown command: $1 (try: ./scripts/dev.sh help)" ;;
esac
