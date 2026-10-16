#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

RUN_DIR="$PROJECT_ROOT/.run"
mkdir -p "$RUN_DIR"

MODELS_DIR="/var/home/brunosouzar/.local/share/models"
LLAMA_SERVER="/var/home/brunosouzar/.local/bin/llama-server"

GEMMA_MODEL="$MODELS_DIR/google_gemma-4-E4B-it-Q5_K_M.gguf"
GLM_MODEL="$MODELS_DIR/GLM-OCR-Q8_0.gguf"
GLM_MMPROJ="$MODELS_DIR/mmproj-GLM-OCR-Q8_0.gguf"

GEMMA_PORT=8085
GLM_PORT=8089
WEB_PORT=3000

echo "=========================================================="
echo " Starting Learning Companion Ecosystem"
echo " Hardware: Intel Arc 140V (Vulkan iGPU)"
echo "=========================================================="

# 1. Ensure binary and model files exist
if [[ ! -x "$LLAMA_SERVER" ]]; then
  echo "Error: llama-server not found or not executable at $LLAMA_SERVER"
  exit 1
fi

if [[ ! -f "$GEMMA_MODEL" ]]; then
  echo "Error: Gemma 4 E4B model not found at $GEMMA_MODEL"
  exit 1
fi

if [[ ! -f "$GLM_MODEL" || ! -f "$GLM_MMPROJ" ]]; then
  echo "Error: GLM-OCR model or vision projector not found in $MODELS_DIR"
  exit 1
fi

# 2. Function to kill existing processes on specified ports
cleanup_port() {
  local port=$1
  local pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Port $port already occupied. Terminating existing process(es): $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

cleanup_port $GEMMA_PORT
cleanup_port $GLM_PORT

# 3. Start Gemma 4 E4B (Study Synthesis / Reading)
echo "Starting Gemma 4 E4B on port $GEMMA_PORT (16k context, Flash Attention, Q8 KV)..."
"$LLAMA_SERVER" \
  -m "$GEMMA_MODEL" \
  --alias gemma-4-e4b \
  -ngl 99 \
  -t 4 \
  -c 16384 \
  -np 1 \
  -fa on \
  -ctk q8_0 -ctv q8_0 \
  --reasoning off \
  --reasoning-budget 0 \
  --host 127.0.0.1 \
  --port "$GEMMA_PORT" \
  --temp 0.2 > "$RUN_DIR/gemma.log" 2>&1 &

GEMMA_PID=$!
echo "$GEMMA_PID" > "$RUN_DIR/gemma.pid"
echo "  Gemma PID: $GEMMA_PID"

# 4. Start GLM-OCR (Visual PDF to Markdown transcription)
echo "Starting GLM-OCR on port $GLM_PORT (8k context, Flash Attention, Multimodal)..."
"$LLAMA_SERVER" \
  -m "$GLM_MODEL" \
  --mmproj "$GLM_MMPROJ" \
  --alias glm-ocr \
  -ngl 99 \
  -t 4 \
  -c 8192 \
  -np 1 \
  -fa on \
  --host 127.0.0.1 \
  --port "$GLM_PORT" \
  --temp 0.1 > "$RUN_DIR/glm_ocr.log" 2>&1 &

GLM_PID=$!
echo "$GLM_PID" > "$RUN_DIR/glm_ocr.pid"
echo "  GLM-OCR PID: $GLM_PID"

# 5. Wait for both models to be ready
wait_for_health() {
  local port=$1
  local name=$2
  local max_retries=60
  local count=0

  printf "Waiting for %s on port %s to be ready..." "$name" "$port"
  while [[ $count -lt $max_retries ]]; do
    if curl -s "http://127.0.0.1:$port/health" | grep -q '"status":"ok"'; then
      echo " READY!"
      return 0
    fi
    sleep 1
    count=$((count + 1))
    printf "."
  done

  echo " FAILED (timeout after ${max_retries}s)!"
  return 1
}

wait_for_health "$GEMMA_PORT" "Gemma 4 E4B"
wait_for_health "$GLM_PORT" "GLM-OCR"

echo ""
echo "All required AI models are healthy and active in RAM/VRAM."
echo "  - Studies LLM : http://127.0.0.1:$GEMMA_PORT/v1 (Gemma 4 E4B)"
echo "  - Vision OCR  : http://127.0.0.1:$GLM_PORT/v1 (GLM-OCR)"
echo ""

# 6. Check if --models-only flag was passed
if [[ "$1" == "--models-only" ]]; then
  echo "Ecosystem started in models-only mode."
  exit 0
fi

# 7. Start Web Server
cleanup_port $WEB_PORT

if [[ "$1" == "--background" ]]; then
  echo "Starting Next.js web application in background on http://localhost:$WEB_PORT..."
  pnpm start > "$RUN_DIR/web.log" 2>&1 &
  WEB_PID=$!
  echo "$WEB_PID" > "$RUN_DIR/web.pid"
  echo "  Web PID: $WEB_PID"
  echo "Ecosystem fully active! Use './stop.sh' to terminate and release RAM/VRAM."
else
  echo "Starting Next.js web application on http://localhost:$WEB_PORT..."
  echo "Press Ctrl+C to stop the web app, or run './stop.sh' from another terminal."
  exec pnpm start
fi
