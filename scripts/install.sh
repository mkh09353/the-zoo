#!/usr/bin/env bash
set -euo pipefail

RELEASE_URL="https://github.com/mkh09353/the-zoo/releases/latest/download"
DMG_NAME="stable-macos-arm64-TheZoo.dmg"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "The Zoo installation is currently supported on macOS only." >&2
  exit 1
fi

if [ "$(uname -m)" != "arm64" ]; then
  echo "The Zoo currently provides an Apple Silicon (arm64) installer only." >&2
  exit 1
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/the-zoo-install.XXXXXX")"
mount_point=""
cleanup() {
  if [ -n "$mount_point" ]; then
    hdiutil detach "$mount_point" -quiet || true
  fi
  rm -rf "$workdir"
}
trap cleanup EXIT INT TERM

dmg="$workdir/$DMG_NAME"
echo "Downloading The Zoo…"
curl --fail --location --silent --show-error "$RELEASE_URL/$DMG_NAME" --output "$dmg"

echo "Mounting installer…"
mount_point="$(hdiutil attach -nobrowse -readonly "$dmg" | awk -F '\t' '/\/Volumes\// { print $NF; exit }')"
if [ -z "$mount_point" ] || [ ! -d "$mount_point/The Zoo.app" ]; then
  echo "The downloaded DMG did not contain The Zoo.app." >&2
  exit 1
fi

echo "Installing The Zoo to /Applications…"
rm -rf "/Applications/The Zoo.app"
ditto "$mount_point/The Zoo.app" "/Applications/The Zoo.app"

signature_details="$(codesign -dv --verbose=4 "/Applications/The Zoo.app" 2>&1 || true)"
if codesign --verify --deep --strict "/Applications/The Zoo.app" >/dev/null 2>&1 \
  && printf '%s\n' "$signature_details" | grep -q '^Authority=Developer ID Application' \
  && printf '%s\n' "$signature_details" | grep -q '^Timestamp='; then
  echo "Verified The Zoo's Developer ID signature; leaving macOS quarantine metadata intact."
else
  # Ad-hoc signatures make an unsigned bundle internally consistent but are not
  # trusted by Gatekeeper. Remove quarantine until releases are Developer ID
  # signed and notarized.
  echo "No trusted Developer ID signature found; removing quarantine for this unsigned build."
  xattr -dr com.apple.quarantine "/Applications/The Zoo.app" || true
fi

echo "The Zoo installed at /Applications/The Zoo.app"
echo "Open it from Applications to get started."
