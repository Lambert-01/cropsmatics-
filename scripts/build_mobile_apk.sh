#!/usr/bin/env bash
set -euo pipefail

# Cropmatics Rwanda — Android APK build helper
#
# Usage:
#   bash scripts/build_mobile_apk.sh              # EAS cloud release APK
#   bash scripts/build_mobile_apk.sh preview      # EAS cloud preview APK
#   bash scripts/build_mobile_apk.sh local        # EAS build on this Mac/Linux machine
#   bash scripts/build_mobile_apk.sh debug        # Local Gradle debug APK
#
# The script validates the mobile app before starting a binary build.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
MODE="${1:-release-apk}"

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

case "$MODE" in
  release-apk)
    echo "==> Building signed shareable APK with EAS profile: release-apk"
    npx eas-cli@latest build --platform android --profile release-apk
    ;;
  preview)
    echo "==> Building signed shareable APK with EAS profile: preview"
    npx eas-cli@latest build --platform android --profile preview
    ;;
  local)
    echo "==> Building release APK locally with the EAS build pipeline"
    echo "    Requires Expo authentication plus Android SDK/NDK and the local EAS prerequisites."
    npx eas-cli@latest build --platform android --profile release-apk --local
    ;;
  debug)
    echo "==> Building local Android debug APK with Gradle"
    cd android
    ./gradlew clean assembleDebug
    APK="$MOBILE_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "APK: $APK"
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    echo "Use: release-apk | preview | local | debug" >&2
    exit 2
    ;;
esac
