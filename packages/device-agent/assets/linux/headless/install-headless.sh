#!/usr/bin/env bash
# Install the headless Comp AI agent on a Linux server and enroll it.
#
#   sudo ./install-headless.sh --token <enrollment token> [--api https://api.example.com] \
#        [--binary ./comp-ai-agent-linux-x64] [--name "web-01"]
#
# Creates the comp-agent system user, installs the binary to /usr/local/bin,
# enrolls with the token (the token is used once and not kept on disk), then
# installs and starts the systemd unit. Re-running upgrades the binary and
# restarts the service; an existing enrollment is kept unless --token is given.
set -euo pipefail

TOKEN="${COMP_AGENT_TOKEN:-}"
API_URL="${COMP_AGENT_API_URL:-}"
BINARY=""
NAME="${COMP_AGENT_NAME:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --api) API_URL="$2"; shift 2 ;;
    --binary) BINARY="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root (sudo)" >&2
  exit 1
fi

if [ -z "$BINARY" ]; then
  for candidate in "$HERE"/comp-ai-agent-linux-* "$HERE"/comp-ai-agent; do
    [ -f "$candidate" ] && BINARY="$candidate" && break
  done
fi
[ -n "$BINARY" ] && [ -f "$BINARY" ] || { echo "agent binary not found; pass --binary" >&2; exit 1; }

STATE_DIR=/var/lib/comp-ai-agent
UNIT_SRC="$HERE/comp-ai-agent.service"
UNIT_DST=/etc/systemd/system/comp-ai-agent.service

if ! id comp-agent >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$STATE_DIR" --shell /usr/sbin/nologin comp-agent
fi
install -d -m 0700 -o comp-agent -g comp-agent "$STATE_DIR"
install -m 0755 "$BINARY" /usr/local/bin/comp-ai-agent

if [ -n "$TOKEN" ]; then
  echo "Enrolling with $( [ -n "$API_URL" ] && echo "$API_URL" || echo 'the built-in API URL' )..."
  env_args=(COMP_AGENT_STATE_DIR="$STATE_DIR" COMP_AGENT_TOKEN="$TOKEN")
  [ -n "$API_URL" ] && env_args+=(COMP_AGENT_API_URL="$API_URL")
  [ -n "$NAME" ] && env_args+=(COMP_AGENT_NAME="$NAME")
  sudo -u comp-agent env "${env_args[@]}" /usr/local/bin/comp-ai-agent enroll
elif [ ! -f "$STATE_DIR/state.json" ]; then
  echo "no enrollment yet: pass --token <enrollment token> (create one in Comp AI under People > Devices)" >&2
  exit 1
fi

if [ -f "$UNIT_SRC" ]; then
  install -m 0644 "$UNIT_SRC" "$UNIT_DST"
fi
systemctl daemon-reload
systemctl enable --now comp-ai-agent.service
systemctl restart comp-ai-agent.service
sleep 2
systemctl --no-pager --lines=5 status comp-ai-agent.service || true
echo
echo "Installed. Logs: journalctl -u comp-ai-agent -f    State: $STATE_DIR"
