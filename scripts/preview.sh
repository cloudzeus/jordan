#!/usr/bin/env bash
# Σταθερό αντίγραφο της εφαρμογής για ΠΡΟΒΟΛΗ, χωριστό από τον φάκελο όπου γράφουν κώδικα οι sessions.
#
# Γιατί: ο dev server στο :3000 τρέχει πάνω στον φάκελο που επεξεργάζονται ταυτόχρονα πολλές sessions·
# κάθε αποθήκευση αρχείου κάνει reload τη σελίδα που βλέπεις. Το αντίγραφο (git worktree
# ../jordan-preview) αλλάζει ΜΟΝΟ όταν τρέξεις `update` — και δείχνει την τελευταία δεσμευμένη έκδοση.
#
#   npm run preview:start    → dev server του αντιγράφου στο http://localhost:3001
#   npm run preview:update   → το αντίγραφο πάει στο τελευταίο commit του master (+ npm ci αν άλλαξαν πακέτα)
#   npm run preview:restart  → σταματά και ξαναξεκινά τον server του αντιγράφου
set -euo pipefail
MAIN="$(cd "$(dirname "$0")/.." && pwd)"
PREVIEW="$(dirname "$MAIN")/jordan-preview"
PORT="${PREVIEW_PORT:-3001}"

ensure() {
  if [ ! -d "$PREVIEW" ]; then
    git -C "$MAIN" worktree add --detach "$PREVIEW" master
    cp "$MAIN/.env" "$PREVIEW/.env"
    (cd "$PREVIEW" && npm ci --no-audit --no-fund)
  fi
}

case "${1:-}" in
  update)
    ensure
    before="$(git -C "$PREVIEW" rev-parse HEAD)"
    git -C "$PREVIEW" checkout --quiet --detach master
    after="$(git -C "$PREVIEW" rev-parse HEAD)"
    cp "$MAIN/.env" "$PREVIEW/.env"
    if ! git -C "$PREVIEW" diff --quiet "$before" "$after" -- package-lock.json; then
      (cd "$PREVIEW" && npm ci --no-audit --no-fund)
    elif ! git -C "$PREVIEW" diff --quiet "$before" "$after" -- prisma/schema.prisma; then
      (cd "$PREVIEW" && npx prisma generate)
    fi
    echo "Preview: $(git -C "$PREVIEW" log --oneline -1)"
    echo "Αν άλλαξε το schema της βάσης: npm run preview:restart"
    ;;
  start)
    ensure
    # Ήδη τρέχει; Δεν ξεκινάμε δεύτερο (θα αποτύγχανε με EADDRINUSE).
    if pid="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)" && [ -n "$pid" ]; then
      echo "Το preview τρέχει ήδη στο http://localhost:$PORT — δεν χρειάζεται να ξεκινήσει ξανά."
      echo "Για restart (π.χ. μετά από αλλαγή schema): npm run preview:restart"
      exit 0
    fi
    # Οι εργασίες παρασκηνίου (worker σαρώσεων) τρέχουν ΜΟΝΟ στον κύριο server (:3000) — το αντίγραφο
    # είναι για προβολή και δεν πρέπει να επεξεργάζεται τις ίδιες ουρές με παλιότερο κώδικα.
    cd "$PREVIEW" && JOBS_DISABLED=1 exec npx next dev -p "$PORT"
    ;;
  restart)
    if pid="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)" && [ -n "$pid" ]; then
      kill $pid; sleep 2
    fi
    exec "$0" start
    ;;
  *)
    echo "Χρήση: scripts/preview.sh update|start|restart" >&2
    exit 1
    ;;
esac
