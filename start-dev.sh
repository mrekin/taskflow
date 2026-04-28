#!/bin/bash
# Auto-restart dev server
LOG="/home/z/my-project/dev.log"
while true; do
  cd /home/z/my-project
  echo "[$(date)] Starting dev server..." >> "$LOG"
  node node_modules/.bin/next dev -p 3000 >> "$LOG" 2>&1
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 2s..." >> "$LOG"
  sleep 2
done
