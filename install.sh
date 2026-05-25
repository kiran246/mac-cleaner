#!/bin/bash
# Mac Cleaner — one-command installer
# Usage: curl -fsSL https://raw.githubusercontent.com/kiran246/mac-cleaner/main/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/kiran246/mac-cleaner"
INSTALL_DIR="$HOME/mac-cleaner"
LAUNCHER="$HOME/Desktop/Mac Cleaner.command"

# ── Helpers ────────────────────────────────────────────────────────────────

print_step() { echo ""; echo "▶ $1"; }
print_ok()   { echo "  ✓ $1"; }
print_err()  { echo "  ✗ $1" >&2; }

require_cmd() {
  command -v "$1" &>/dev/null
}

# ── 1. Homebrew ────────────────────────────────────────────────────────────

print_step "Checking for Homebrew..."
if ! require_cmd brew; then
  echo "  Installing Homebrew (you may be prompted for your password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Add Homebrew to PATH for this session (Apple Silicon or Intel)
if [[ -f /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -f /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
print_ok "Homebrew ready"

# ── 2. Git ─────────────────────────────────────────────────────────────────

print_step "Checking for git..."
if ! require_cmd git; then
  echo "  Installing git..."
  brew install git
fi
print_ok "git ready"

# ── 3. Python 3.9+ ─────────────────────────────────────────────────────────

print_step "Checking for Python 3.9+..."
PYTHON=""
for cmd in python3.13 python3.12 python3.11 python3.10 python3.9 python3; do
  if require_cmd "$cmd"; then
    OK=$("$cmd" -c "import sys; print(sys.version_info >= (3, 9))" 2>/dev/null || echo "False")
    if [[ "$OK" == "True" ]]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "  Installing Python via Homebrew..."
  brew install python3
  PYTHON="python3"
fi
print_ok "Python ready ($($PYTHON --version))"

# ── 4. Download Mac Cleaner ────────────────────────────────────────────────

print_step "Downloading Mac Cleaner..."
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "  Found existing install — updating..."
  git -C "$INSTALL_DIR" pull --ff-only --quiet
  print_ok "Updated to latest version"
else
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  print_ok "Downloaded to $INSTALL_DIR"
fi

# ── 5. Python dependencies ─────────────────────────────────────────────────

print_step "Installing Python dependencies..."
"$PYTHON" -m venv "$INSTALL_DIR/.venv" --upgrade-deps --quiet
"$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" --quiet
print_ok "Dependencies installed"

# ── 6. Desktop launcher ────────────────────────────────────────────────────

print_step "Creating Desktop launcher..."
cat > "$LAUNCHER" <<'SCRIPT'
#!/bin/bash
# Mac Cleaner launcher — double-click to start

INSTALL_DIR="$HOME/mac-cleaner"
PORT=8765

cd "$INSTALL_DIR" || { echo "Install directory not found. Run install.sh again."; read -r; exit 1; }

# Stop any previous instance on this port
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
sleep 0.3

echo "╔════════════════════════════╗"
echo "║       Mac Cleaner          ║"
echo "╚════════════════════════════╝"
echo ""
echo "  Starting server on http://127.0.0.1:$PORT"
echo "  Close this window (or press Ctrl+C) to stop."
echo ""

# Open browser after server has had time to start
(sleep 2 && open "http://127.0.0.1:$PORT") &

exec .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port "$PORT" --log-level warning
SCRIPT

chmod +x "$LAUNCHER"

# Remove quarantine flag so macOS doesn't block the first run
xattr -d com.apple.quarantine "$LAUNCHER" 2>/dev/null || true

print_ok "Launcher created: ~/Desktop/Mac Cleaner.command"

# ── Done ───────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════"
echo "  Installation complete!"
echo ""
echo "  → Double-click 'Mac Cleaner.command'"
echo "    on your Desktop to launch the app."
echo "══════════════════════════════════════════════"
echo ""
