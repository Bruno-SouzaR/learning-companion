#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

RUN_DIR="$PROJECT_ROOT/.run"

GEMMA_PORT=8085
GLM_PORT=8089
WEB_PORT=3000

echo "=========================================================="
echo " Stopping Learning Companion Ecosystem & Freeing Memory"
echo "=========================================================="

kill_pid_file() {
  local pid_file=$1
  local name=$2
  if [[ -f "$pid_file" ]]; then
    local pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ -n "$pid" && -d "/proc/$pid" ]]; then
      echo "Stopping $name (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      if [[ -d "/proc/$pid" ]]; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

# 1. Kill tracked PIDs
kill_pid_file "$RUN_DIR/web.pid" "Next.js Web Application"
kill_pid_file "$RUN_DIR/llm.pid" "Studies LLM (Port $GEMMA_PORT)"
kill_pid_file "$RUN_DIR/gemma.pid" "Gemma 4 E4B (Port $GEMMA_PORT)"
kill_pid_file "$RUN_DIR/glm_ocr.pid" "GLM-OCR (Port $GLM_PORT)"
systemctl --user stop learning-llm.service 2>/dev/null || true
# 2. Force cleanup of ports if any rogue processes remained
cleanup_port() {
  local port=$1
  local name=$2
  local pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Releasing port $port ($name) - killing PID(s): $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

cleanup_port $WEB_PORT "Web App"
cleanup_port $GEMMA_PORT "Gemma 4 E4B"
cleanup_port $GLM_PORT "GLM-OCR"

# 3. Kill any lingering llama-server or next-server launched in project
pkill -9 -f "llama-server.*(8085|8089)" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

# 4. Remove runtime directory
rm -rf "$RUN_DIR"

sleep 1

# 5. Verification and Resource Audit
echo ""
echo "=== Ground-Truth Verification ==="
ALL_CLEAN=true

for port in $WEB_PORT $GEMMA_PORT $GLM_PORT; do
  if curl -s -I "http://127.0.0.1:$port" > /dev/null 2>&1; then
    echo "  [FAIL] Port $port is still responding!"
    ALL_CLEAN=false
  else
    echo "  [OK] Port $port is closed."
  fi
done

# 6. Memory & VRAM Audit
echo ""
echo "=== Memory & VRAM Status ==="
if [[ -f /proc/meminfo ]]; then
  MEM_AVAIL=$(grep "MemAvailable:" /proc/meminfo | awk '{printf "%.1f GB", $2/1024/1024}')
  MEM_FREE=$(grep "MemFree:" /proc/meminfo | awk '{printf "%.1f GB", $2/1024/1024}')
  GPU_ACTIVE=$(grep "GPUActive:" /proc/meminfo 2>/dev/null | awk '{printf "%.1f MB", $2/1024}' || echo "N/A")
  
  echo "  RAM Available : $MEM_AVAIL"
  echo "  RAM Free      : $MEM_FREE"
  echo "  VRAM Active   : $GPU_ACTIVE"
fi

if [[ "$ALL_CLEAN" == "true" ]]; then
  echo ""
  echo "Ecosystem cleanly stopped and all memory deallocated successfully!"
else
  echo ""
  echo "Warning: Some ports could not be confirmed as closed."
  exit 1
fi
