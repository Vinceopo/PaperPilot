#!/usr/bin/env bash
# PaperPilot Android APK builder (TUI)
# 1) Install requirements  2) Always run Expo Doctor  3) Build Android APK
#
# Usage:
#   ./build-android.sh
#   ./build-android.sh --profile production
#   ./build-android.sh --local
#   ./build-android.sh --skip-install --yes

set -euo pipefail

PROFILE="preview"
LOCAL=0
SKIP_INSTALL=0
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-preview}"; shift 2 ;;
    --local) LOCAL=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --yes|-y) YES=1; shift ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

MOBILE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$MOBILE_ROOT"

if [[ ! -f package.json ]]; then
  echo "✗ package.json not found — run from mobile/"
  exit 1
fi

# ---- colors ----
if [[ -t 1 ]]; then
  C=$'\033[38;2;37;99;235m'; R=$'\033[0m'; G=$'\033[32m'
  Y=$'\033[33m'; RED=$'\033[31m'; CY=$'\033[36m'; DIM=$'\033[2m'
else
  C=; R=; G=; Y=; RED=; CY=; DIM=
fi

ok()   { echo "  ${G}✓${R} $*"; }
warn() { echo "  ${Y}!${R} $*"; }
fail() { echo "  ${RED}✗${R} $*"; }
info() { echo "  ${CY}→${R} $*"; }

banner() {
  clear 2>/dev/null || true
  echo ""
  echo "${C}  ╔══════════════════════════════════════════════╗${R}"
  echo "${C}  ║                                              ║${R}"
  echo "${C}  ║          PaperPilot  ·  Android APK          ║${R}"
  echo "${C}  ║                                              ║${R}"
  echo "${C}  ╚══════════════════════════════════════════════╝${R}"
  echo "${DIM}  install → doctor → build (android only)${R}"
  echo ""
}

step() {
  local n="$1" total="$2" title="$3"
  echo ""
  echo "${C}━━━ [$n/$total] $title ${R}"
  echo "────────────────────────────────────────────────────"
}

TOTAL=4
[[ "$SKIP_INSTALL" -eq 1 ]] && TOTAL=3
STEP=0

banner

# ---- profile menu ----
if [[ "$YES" -eq 0 && "$LOCAL" -eq 0 ]]; then
  echo "  Build target:"
  echo "    [1] preview     - internal APK  (default, eas.json buildType=apk)"
  echo "    [2] production  - store/AAB build"
  echo "    [3] development - dev client"
  echo "    [L] local       - Gradle assembleRelease (no EAS cloud)"
  echo ""
  read -r -p "  Choose [1/2/3/L] (Enter = 1): " choice || true
  case "${choice:-}" in
    ""|1) PROFILE="preview" ;;
    2) PROFILE="production" ;;
    3) PROFILE="development" ;;
    L|l) LOCAL=1 ;;
    *) warn "Unknown choice — using preview"; PROFILE="preview" ;;
  esac
fi

if [[ "$LOCAL" -eq 1 ]]; then
  info "Mode: LOCAL Gradle APK"
else
  info "Mode: EAS cloud · profile=$PROFILE"
fi
info "Project: $MOBILE_ROOT"
echo ""

# ---- install ----
if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  STEP=$((STEP + 1))
  step "$STEP" "$TOTAL" "Install requirements"

  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js not installed. Get LTS from https://nodejs.org"
    exit 1
  fi
  ok "Node $(node -v)"

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm not found on PATH"
    exit 1
  fi
  ok "npm $(npm -v)"

  info "Installing npm dependencies..."
  npm install --no-fund --no-audit
  ok "npm dependencies installed"

  if [[ "$LOCAL" -eq 0 ]]; then
    info "Ensuring EAS CLI (eas-cli)..."
    npm install --no-save --no-fund --no-audit eas-cli@latest
    ok "eas-cli ready"
  fi
else
  warn "SkipInstall — assuming deps + EAS already present"
fi

# ---- doctor (always) ----
STEP=$((STEP + 1))
step "$STEP" "$TOTAL" "Expo Doctor (always)"

info "Running npx expo-doctor ..."
DOCTOR_OK=1
if ! npx --yes expo-doctor; then
  warn "expo-doctor exited non-zero; trying npx expo doctor ..."
  if ! npx --yes expo doctor; then
    DOCTOR_OK=0
  fi
fi

if [[ "$DOCTOR_OK" -eq 1 ]]; then
  ok "Doctor finished clean"
else
  warn "Doctor reported issues."
  if [[ "$YES" -eq 0 ]]; then
    read -r -p "  Continue to Android build anyway? [y/N]: " cont || true
    if [[ ! "${cont:-}" =~ ^[Yy]$ ]]; then
      fail "Aborted after doctor."
      exit 1
    fi
  else
    warn "--yes set: continuing despite doctor issues"
  fi
fi

# ---- auth / local toolchain ----
STEP=$((STEP + 1))
if [[ "$LOCAL" -eq 0 ]]; then
  step "$STEP" "$TOTAL" "EAS login check"
  info "Checking Expo account..."
  if ! WHOAMI=$(npx --yes eas-cli whoami 2>&1); then
    warn "Not logged in to Expo."
    info "Opening login..."
    npx --yes eas-cli login
    WHOAMI=$(npx --yes eas-cli whoami)
  fi
  ok "Logged in as: $WHOAMI"
else
  step "$STEP" "$TOTAL" "Local Android toolchain"
  if command -v java >/dev/null 2>&1; then
    ok "Java: $(java -version 2>&1 | head -n1)"
  else
    warn "Java not on PATH — install JDK 17+"
  fi
  if [[ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
    warn "ANDROID_HOME / ANDROID_SDK_ROOT not set"
  else
    ok "Android SDK: ${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
  fi
fi

# ---- build ----
STEP=$((STEP + 1))
step "$STEP" "$TOTAL" "Build Android APK"

if [[ "$LOCAL" -eq 1 ]]; then
  if [[ ! -d android ]]; then
    info "Running expo prebuild --platform android ..."
    npx --yes expo prebuild --platform android --non-interactive
  else
    ok "android/ folder present"
  fi

  if [[ ! -x android/gradlew ]]; then
    chmod +x android/gradlew || true
  fi

  info "Running Gradle assembleRelease (APK)..."
  (cd android && ./gradlew assembleRelease --no-daemon)

  APK_DIR="android/app/build/outputs/apk/release"
  echo ""
  ok "Local APK build finished"
  if [[ -d "$APK_DIR" ]]; then
    info "Output folder: $MOBILE_ROOT/$APK_DIR"
    find "$APK_DIR" -name '*.apk' -print 2>/dev/null | while read -r f; do ok "$f"; done
  fi
else
  info "Starting EAS Android build (profile=$PROFILE)..."
  info "Command: npx eas-cli build --platform android --profile $PROFILE --non-interactive"

  if [[ "$YES" -eq 0 ]]; then
    echo ""
    read -r -p "  Start EAS build now? [Y/n]: " go || true
    if [[ "${go:-}" =~ ^[Nn]$ ]]; then
      fail "Build cancelled."
      exit 0
    fi
  fi

  npx --yes eas-cli build --platform android --profile "$PROFILE" --non-interactive

  echo ""
  ok "EAS build submitted / completed"
  info "Download the APK from the Expo dashboard link printed above."
  if [[ "$PROFILE" == "preview" ]]; then
    info "preview profile uses android.buildType=apk (see eas.json)."
  fi
fi

echo ""
echo "════════════════════════════════════════════════════"
ok "Done."
echo ""
