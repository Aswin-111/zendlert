#!/usr/bin/env bash
# upload.sh — ship the latest docker tar to the VPS and load it.
# Run from WSL in the project root:  ./upload.sh
set -euo pipefail

# ───── Config ───────────────────────────────────────────────────────────
VPS_USER="ubuntu"
VPS_HOST="98.93.3.139"
SSH_KEY="/root/.ssh/zendlert-key.pem"
TAR_FILE="./docker-tars/zendlert_latest.tar"
REMOTE_COMPOSE_DIR="/composefiles/zendlert-backend"
REMOTE_TAR="$REMOTE_COMPOSE_DIR/zendlert_latest.tar"
# ────────────────────────────────────────────────────────────────────────

# Fast-fail checks
[[ -f "$TAR_FILE" ]] || { echo "❌ $TAR_FILE not found. Run build.ps1 first."; exit 1; }
[[ -f "$SSH_KEY"  ]] || { echo "❌ SSH key not found at $SSH_KEY"; exit 1; }

# SSH demands 600 on keys
chmod 600 "$SSH_KEY" 2>/dev/null || true

TAR_SIZE=$(du -h "$TAR_FILE" | cut -f1)
echo "📦 Uploading $TAR_FILE ($TAR_SIZE) → $VPS_USER@$VPS_HOST:$REMOTE_TAR"
echo

# Step 1: scp directly into the compose dir
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$TAR_FILE" "$VPS_USER@$VPS_HOST:$REMOTE_TAR"

echo
echo "✅ Upload complete. Loading image on VPS…"
echo

# Step 2: load + restart on the VPS
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$VPS_USER@$VPS_HOST" bash <<EOF
set -euo pipefail

cd "$REMOTE_COMPOSE_DIR"

echo "→ docker load…"
docker load -i zendlert_latest.tar

if [[ -f docker-compose.yml ]]; then
    echo "→ restarting backend container…"
    sudo docker compose up -d
    sudo docker compose ps
else
    echo "⚠️  No docker-compose.yml in $REMOTE_COMPOSE_DIR — image loaded but not restarted."
fi

echo
echo "→ pruning dangling layers from previous builds…"
docker image prune -f >/dev/null

echo
echo "✅ Deploy done."
EOF

echo
echo "🎉 All done. Tail logs with:"
echo "   ssh -i \"$SSH_KEY\" $VPS_USER@$VPS_HOST 'cd $REMOTE_COMPOSE_DIR && docker compose logs -f backend'"