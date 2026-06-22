#!/usr/bin/env bash
# init.sh — SDD harness environment verification
#
# Run at the START of every session and before declaring any feature done.
# If this script fails, the session must not proceed.

set -u
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }

EXIT_CODE=0

echo "── 1. Checking harness base files ──────────────────────"

for f in AGENTS.md CHECKPOINTS.md feature_list.json \
          progress/current.md progress/history.md \
          docs/architecture.md docs/conventions.md docs/verification.md; do
  if [ ! -f "$f" ]; then
    fail "Missing base file: $f"
    EXIT_CODE=1
  else
    ok "Exists: $f"
  fi
done

echo ""
echo "── 2. Validating feature_list.json ─────────────────────"

python3 - << 'PY'
import json, sys

try:
    data = json.load(open("feature_list.json"))
    valid_status = set(data["rules"]["valid_status"])
    in_progress = [f for f in data["features"] if f["status"] == "in_progress"]

    if len(in_progress) > 1:
        print(f"[FAIL]  {len(in_progress)} features in_progress (max 1 allowed)")
        sys.exit(1)

    for f in data["features"]:
        if f["status"] not in valid_status:
            print(f"[FAIL]  Invalid status on feature {f['id']}: {f['status']}")
            sys.exit(1)
        if f["status"] == "done" and not f.get("spec_path"):
            print(f"[FAIL]  Feature {f['id']} is done but has no spec_path")
            sys.exit(1)

    print(f"[OK]    feature_list.json valid ({len(data['features'])} features)")

except Exception as e:
    print(f"[FAIL]  feature_list.json invalid: {e}")
    sys.exit(1)
PY

if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo ""
echo "── 3. Validating spec JSON files ───────────────────────"

python3 - << 'PY'
import json, sys, glob

REQUIRED = {"id", "status", "createdAt", "author", "title",
            "description", "acceptance_criteria", "dependencies"}
VALID_STATUS = {"draft", "approved", "implemented", "failed_review"}
errors = 0

specs = glob.glob("specs/**/*.json", recursive=True)
if not specs:
    print("[WARN]  No specs found in specs/ yet")
else:
    for path in specs:
        try:
            spec = json.load(open(path))
            missing = REQUIRED - set(spec.keys())
            if missing:
                print(f"[FAIL]  {path}: missing fields {missing}")
                errors += 1
                continue
            if spec["status"] not in VALID_STATUS:
                print(f"[FAIL]  {path}: invalid status '{spec['status']}'")
                errors += 1
                continue
            if not isinstance(spec["acceptance_criteria"], list) or not spec["acceptance_criteria"]:
                print(f"[FAIL]  {path}: acceptance_criteria is empty or not an array")
                errors += 1
                continue
            print(f"[OK]    {path} ({spec['status']})")
        except Exception as e:
            print(f"[FAIL]  {path}: {e}")
            errors += 1

    if errors > 0:
        sys.exit(1)
PY

if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo ""
echo "── 4. Verifying the extension (outputs/) ───────────────"

if [ -d "outputs" ] && command -v node >/dev/null 2>&1; then
  EXT_OK=1

  if python3 -c "import json; json.load(open('outputs/manifest.json'))" 2>/dev/null; then
    ok "outputs/manifest.json is valid JSON"
  else
    fail "outputs/manifest.json missing or invalid"; EXT_OK=0
  fi

  # Classic scripts (content script world + service worker).
  for f in storage.js content.js background.js; do
    if [ -f "outputs/$f" ] && node --check "outputs/$f" 2>/dev/null; then
      ok "node --check outputs/$f"
    else
      fail "syntax error or missing: outputs/$f"; EXT_OK=0
    fi
  done

  # Side-panel ES modules: parse as ESM via a temp .mjs copy (syntax only).
  TMP=$(mktemp -d)
  for f in $(cd outputs && ls sidebar.js sidebar/*.js 2>/dev/null); do
    cp "outputs/$f" "$TMP/m.mjs"
    if node --check "$TMP/m.mjs" 2>/dev/null; then
      ok "ESM ok: outputs/$f"
    else
      fail "ESM syntax error: outputs/$f"; EXT_OK=0
    fi
  done
  rm -rf "$TMP"

  if [ $EXT_OK -ne 1 ]; then EXIT_CODE=1; fi
else
  warn "outputs/ or node not available — skipping extension checks"
fi

echo ""
echo "── 5. Running tests (optional) ─────────────────────────"

if [ -d "tests" ] && [ "$(ls -A tests/ 2>/dev/null)" ]; then
  if python3 -m pytest tests/ -v --tb=short 2>&1; then
    ok "All tests pass"
  else
    fail "Tests are failing"
    EXIT_CODE=1
  fi
else
  warn "tests/ is empty or does not exist — skipping"
fi

echo ""
echo "── 6. Checking progress/ state ─────────────────────────"

python3 - << 'PY'
content = open("progress/current.md").read().strip()
stale_markers = ["_none_", "_—_", "none", "template"]
if any(m in content for m in stale_markers) or len(content) < 50:
    print("[OK]    progress/current.md is clean (no active session)")
else:
    print("[WARN]  progress/current.md has content — active or unclosed session detected")
PY

echo ""
echo "── 7. Summary ──────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Harness ready. You can start working."
else
  fail "Harness NOT ready. Fix the errors above before proceeding."
fi

exit $EXIT_CODE
