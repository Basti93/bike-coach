#!/usr/bin/env bash
# Signiert die gebaute App ad hoc (Apple-Chips starten sonst nichts) und legt sie nach /Applications.
# Bricht ab, solange eine Fahrt offen ist: Der Austausch würde den laufenden Dienst treffen.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="release/mac-arm64/Bike Coach.app"
DEST="/Applications/Bike Coach.app"
LIVE_STATE=$(node -e "
const W=require('ws');const w=new W('ws://127.0.0.1:7410');
w.on('message',d=>{const m=JSON.parse(d);if(m.type==='state'){console.log(m.ride?'open':'none');process.exit(0)}});
w.on('error',()=>{console.log('none');process.exit(0)});setTimeout(()=>{console.log('none');process.exit(0)},4000);" 2>/dev/null || echo none)
if [ "$LIVE_STATE" = "open" ]; then echo "Fahrt offen, nichts installiert."; exit 1; fi
codesign --force --deep --sign - "$SRC"
codesign --verify --deep "$SRC"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installiert: $DEST"
