#!/usr/bin/env bash
# harness.sh — Manual harness activator
#
# Use this if the UserPromptSubmit hook is not firing reliably
# in the VS Code extension. Run once at the start of a session.

touch .harness-active
echo "[harness] activated — the SDD flow will trigger on your next prompt"
echo "[harness] to deactivate: rm .harness-active"
