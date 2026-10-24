#!/usr/bin/env bash
#
# Build a Cropmatics Rwanda Android artifact.
#
# Subcommands (default: preview):
#   release-apk   Signed, shareable internal APK via EAS (profile: release-apk).
#                 This profile MUST produce an .apk, never an .aab.
#   preview       Internal preview APK via EAS (profile: preview).
#   local         EAS-equivalent build on this machine (eas build --local),
#                 using the release-apk profile. Requires the Android SDK +
#                 JDK and a logged-in EAS account.
#   debug         Simple local debug APK via Gradle (no EAS account needed).
#
# For Google Play use the production profile explicitly; it builds an
# Android App Bundle (.aab):
#
#   eas build --platform android --profile production
#
# That artifact is NOT interchangeable with the internal APK above.
#
# Requirements:
#   release-apk / preview / local : eas-cli (npm i -g eas-cli, then `eas login`)
#   debug                         : Android SDK + JDK, and a generated
#                                   apps/mobile/android project.
#
# API base URL:
#   The EAS profiles in apps/mobile/eas.json bake EXPO_PUBLIC_API_BASE_URL into
#   the bundle. Override it with --api URL, which writes a temporary
#   apps/mobile/.env for the duration of the build and restores it on exit.
set -euo pipefail

# EAS invokes git while preparing the upload. Keep the standard macOS command
# line tool locations available even when this script is launched from a GUI or
# a minimal shell, then fail before npm/EAS work if git is genuinely missing.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
if ! command -v git >/dev/null 2>&1 || ! git --version >/dev/null 2>&1; then
  echo "git could not be executed. Install/enable Xcode Command Line Tools, then rerun this script."
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT/apps/mobile"

MODE="${1:-preview}"
shift || true

API_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --api) API_URL="$2"; shift 2 ;;
    *) echo "unknown option: $1 (only --api URL is supported)"; exit 1 ;;
  esac
done

require_eas() {
  if ! command -v eas >/dev/null 2>&1; then
    echo "eas-cli not found. Install it with:  npm i -g eas-cli"
    echo "Then log in with:                    eas login"
    exit 1
  fi
}

# Bake EXPO_PUBLIC_API_BASE_URL for the duration of a build, restoring the
# developer's own apps/mobile/.env afterwards. Expo inlines EXPO_PUBLIC_* at
# bundle time, so the value is fixed into the artifact.
GEN_ENV="$MOBILE_DIR/.env"
BACKUP_ENV="$MOBILE_DIR/.env.build-backup"
HAD_DEV_ENV=0
restore_env() {
  if [ "$HAD_DEV_ENV" = "1" ]; then
    mv "$BACKUP_ENV" "$GEN_ENV"
  elif [ -n "${WROTE_ENV:-}" ]; then
    rm -f "$GEN_ENV"
  fi
  return 0
}

with_api_env() {
  if [ -n "$API_URL" ]; then
    [ -f "$GEN_ENV" ] && { cp "$GEN_ENV" "$BACKUP_ENV"; HAD_DEV_ENV=1; }
    WROTE_ENV=1
    trap restore_env EXIT
    printf 'EXPO_PUBLIC_API_BASE_URL=%s\n' "$API_URL" > "$GEN_ENV"
    echo "==> API base URL : $API_URL (baked into this build)"
  else
    echo "==> API base URL : profile default (verify it is the hosted Render URL before sharing)"
  fi
}

build_eas() {
  local profile="$1"
  require_eas
  with_api_env
  echo "==> EAS profile  : $profile"
  echo "==> Git          : $(git --version)"
  cd "$MOBILE_DIR"
  eas build --platform android --profile "$profile" --non-interactive
  cat <<EOF

Build submitted. EAS prints the artifact URL when it finishes (10-20 min).
Download the .apk from that URL and share it directly.
EOF
}

# Validate the mobile app before starting a binary build.
validate() {
  cd "$MOBILE_DIR"

  echo "==> Installing locked mobile dependencies"
  npm ci

  echo "==> TypeScript"
  npm run typecheck

  echo "==> ESLint"
  npm run lint

  echo "==> Tests"
  npm test

  echo "==> Expo configuration check"
  npx expo config --type public >/dev/null

  echo "==> Validation passed"
}

case "$MODE" in
  release-apk)
    validate
    build_eas "release-apk"
    ;;
  preview)
    validate
    build_eas "preview"
    ;;
  local)
    validate
    require_eas
    with_api_env
    echo "==> Local EAS build (profile: release-apk)"
    cd "$MOBILE_DIR"
    eas build --platform android --profile release-apk --local --non-interactive
    echo
    echo "Local build finished. The .apk path is printed above."
    ;;
  debug)
    validate
    # Expo inlines EXPO_PUBLIC_* while Metro bundles the native app. Keep the
    # local Gradle path consistent with EAS: --api must affect every APK mode.
    with_api_env
    if [ ! -x "$MOBILE_DIR/android/gradlew" ]; then
      echo "apps/mobile/android/gradlew not found."
      echo "Generate the native project first:  (cd apps/mobile && npx expo prebuild --platform android)"
      exit 1
    fi
    echo "==> Gradle assembleDebug"
    cd "$MOBILE_DIR/android"
    ./gradlew assembleDebug
    echo
    echo "Debug APK: $MOBILE_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  *)
    echo "unknown subcommand: $MODE"
    echo "usage: bash scripts/build_mobile_apk.sh {release-apk|preview|local|debug} [--api URL]"
    exit 1
    ;;
esac
