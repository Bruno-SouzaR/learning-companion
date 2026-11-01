#!/usr/bin/env bash
set -e

MODELS_DIR="/var/home/brunosouzar/.local/share/models"
SERVICE_FILE="/var/home/brunosouzar/.config/systemd/user/learning-llm.service"
ENV_FILE="$(dirname "$0")/../.env"

declare -A MODEL_FILES=(
  ["lfm3-1.7b"]="$MODELS_DIR/LFM3-1.7B-QAD-Q4_0.gguf"
  ["lfm3-1.7b-q8"]="$MODELS_DIR/LFM3-1.7B-Q8_0.gguf"
  ["lfm3-vl"]="$MODELS_DIR/LFM3-VL-2B-QAD-Q4_0.gguf"
  ["gemma-4-e2b"]="$MODELS_DIR/gemma-4-E2B-it-Q8_0.gguf"
  ["gemma-4-e2b-q5"]="$MODELS_DIR/gemma-4-E2B-it-Q5_K_M.gguf"
  ["gemma-4-e4b"]="$MODELS_DIR/google_gemma-4-E4B-it-Q5_K_M.gguf"
  ["qwen-2b-q5"]="$MODELS_DIR/Qwen3.5-2B-Q5_K_M.gguf"
  ["qwen-2b-q8"]="$MODELS_DIR/Qwen3.5-2B-Q8_0.gguf"
  ["qwen-4b-q5"]="$MODELS_DIR/Qwen3.5-4B-Q5_K_M.gguf"
  ["glm-ocr"]="$MODELS_DIR/GLM-OCR-Q8_0.gguf"
)

declare -A MODEL_ALIASES=(
  ["lfm3-1.7b"]="lfm3:1.7b-qad"
  ["lfm3-1.7b-q8"]="lfm3:1.7b-q8"
  ["lfm3-vl"]="lfm3-vl:2b-qad"
  ["gemma-4-e2b"]="gemma-4-e2b"
  ["gemma-4-e2b-q5"]="gemma-4-e2b"
  ["gemma-4-e4b"]="gemma-4-e4b"
  ["qwen-2b-q5"]="qwen3.5:2b-q5"
  ["qwen-2b-q8"]="qwen3.5:2b-q8"
  ["qwen-4b-q5"]="qwen3.5:4b-q5"
  ["glm-ocr"]="glm-ocr"
)

declare -A MODEL_CTX=(
  ["lfm3-1.7b"]="16384"
  ["lfm3-1.7b-q8"]="16384"
  ["lfm3-vl"]="16384"
  ["gemma-4-e2b"]="8192"
  ["gemma-4-e2b-q5"]="8192"
  ["gemma-4-e4b"]="16384"
  ["qwen-2b-q5"]="8192"
  ["qwen-2b-q8"]="8192"
  ["qwen-4b-q5"]="8192"
  ["glm-ocr"]="8192"
)

declare -A MODEL_EXTRA_FLAGS=(
  ["lfm3-1.7b"]="-np 1 -fa on --temp 0.1 --top-k 50 --repeat-penalty 1.1 --reasoning off --reasoning-budget 0 --no-reasoning-preserve"
  ["lfm3-1.7b-q8"]="-np 1 -fa on --temp 0.1 --top-k 50 --repeat-penalty 1.1 --reasoning off --reasoning-budget 0 --no-reasoning-preserve"
  ["lfm3-vl"]="-np 1 -fa on --mmproj $MODELS_DIR/mmproj-LFM3-VL-2B-Q8_0.gguf --temp 0.1 --top-k 50 --repeat-penalty 1.1 --reasoning off --reasoning-budget 0 --no-reasoning-preserve"
  ["gemma-4-e2b"]="-np 1 -fa on -ctk q8_0 -ctv q8_0"
  ["gemma-4-e2b-q5"]="-np 1 -fa on -ctk q8_0 -ctv q8_0"
  ["gemma-4-e4b"]="-np 1 -fa on -ctk q8_0 -ctv q8_0"
  ["qwen-2b-q5"]=""
  ["qwen-2b-q8"]=""
  ["qwen-4b-q5"]=""
  ["glm-ocr"]="--mmproj $MODELS_DIR/mmproj-GLM-OCR-Q8_0.gguf"
)

function show_help() {
  echo "Usage: $0 <preset|status|list>"
  echo ""
  echo "Available presets:"
  for k in "${!MODEL_FILES[@]}"; do
    local f="${MODEL_FILES[$k]}"
    local status="[NOT FOUND]"
    if [[ -f "$f" ]]; then
      local size=$(du -h "$f" | cut -f1)
      status="[READY: $size]"
    fi
    printf "  %-14s %s (%s)\n" "$k" "$status" "${MODEL_ALIASES[$k]}"
  done
}

function show_status() {
  local port=8085
  if [[ -f "$ENV_FILE" ]]; then
    local p=$(grep "^LLM_BASE_URL=" "$ENV_FILE" | grep -o ':[0-9]\+' | tr -d ':')
    if [[ -n "$p" ]]; then port="$p"; fi
  fi

  echo "=== Current LLM Service Status ==="
  if curl -s "http://127.0.0.1:${port}/health" > /dev/null 2>&1; then
    local models_info=$(curl -s "http://127.0.0.1:${port}/v1/models")
    local active_model=$(python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', [{}])[0].get('id', data.get('models', [{}])[0].get('name', 'unknown')))" <<< "$models_info" 2>/dev/null || echo "unknown")
    local ctx=$(python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', [{}])[0].get('meta', {}).get('n_ctx', 'unknown'))" <<< "$models_info" 2>/dev/null || echo "unknown")
    echo "  Status:  ACTIVE (http://127.0.0.1:${port})"
    echo "  Model:   $active_model"
    echo "  Context: $ctx tokens"
  elif curl -s "http://127.0.0.1:8080/health" > /dev/null 2>&1; then
    local models_info=$(curl -s "http://127.0.0.1:8080/v1/models")
    local active_model=$(python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', [{}])[0].get('id', data.get('models', [{}])[0].get('name', 'unknown')))" <<< "$models_info" 2>/dev/null || echo "unknown")
    local ctx=$(python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', [{}])[0].get('meta', {}).get('n_ctx', 'unknown'))" <<< "$models_info" 2>/dev/null || echo "unknown")
    echo "  Status:  ACTIVE (http://127.0.0.1:8080)"
    echo "  Model:   $active_model"
    echo "  Context: $ctx tokens"
  else
    echo "  Status:  INACTIVE (port ${port} and 8080 unreachable)"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    local env_model=$(grep "^LLM_MODEL=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"')
    echo "  .env:    LLM_MODEL=$env_model"
  fi
}

TARGET="$1"

if [[ -z "$TARGET" || "$TARGET" == "list" || "$TARGET" == "--help" || "$TARGET" == "-h" ]]; then
  show_help
  exit 0
fi

if [[ "$TARGET" == "status" ]]; then
  show_status
  exit 0
fi

if [[ -z "${MODEL_FILES[$TARGET]}" ]]; then
  echo "Error: Unknown preset '$TARGET'"
  show_help
  exit 1
fi

MODEL_PATH="${MODEL_FILES[$TARGET]}"
ALIAS="${MODEL_ALIASES[$TARGET]}"
CTX="${MODEL_CTX[$TARGET]}"
EXTRA="${MODEL_EXTRA_FLAGS[$TARGET]}"

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Error: Model file does not exist at $MODEL_PATH"
  exit 1
fi
local_port=8085
if [[ -f "$ENV_FILE" ]]; then
  p=$(grep "^LLM_BASE_URL=" "$ENV_FILE" | grep -o ':[0-9]\\+' | tr -d ':')
  if [[ -n "$p" ]]; then local_port="$p"; fi
fi

echo "Switching to model preset: $TARGET ($ALIAS)..."
echo "  Path: $MODEL_PATH"
echo "  Context: $CTX"
echo "  Port: $local_port"

mkdir -p "$(dirname "$SERVICE_FILE")"

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Learning Companion Local LLM Server ($TARGET on Intel Arc Vulkan iGPU)
After=network.target

[Service]
Type=simple
Environment="LD_LIBRARY_PATH=/var/home/brunosouzar/.local/lib/llama-vulkan"
ExecStart=/var/home/brunosouzar/.local/bin/llama-server \\
  -m $MODEL_PATH \\
  --alias $ALIAS \\
  -ngl 99 \\
  -t 4 \\
  -c $CTX \\
  $EXTRA \\
  --reasoning off \\
  --reasoning-budget 0 \\
  --host 127.0.0.1 \\
  --port $local_port \\
  --temp 0.2
Restart=always
RestartSec=3
[Install]
WantedBy=default.target
EOF

echo "Reloading systemd and restarting learning-llm.service..."
systemctl --user daemon-reload
pkill -f llama-server 2>/dev/null || true
systemctl --user restart learning-llm.service

echo "Waiting for llama-server to be ready on port $local_port..."
RETRY=0
MAX_RETRIES=20
READY=false
while [[ $RETRY -lt $MAX_RETRIES ]]; do
  if curl -s "http://127.0.0.1:${local_port}/health" > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
  RETRY=$((RETRY + 1))
done

if [[ "$READY" != "true" ]]; then
  echo "Warning: llama-server took longer than expected to start. Check 'systemctl --user status learning-llm.service'"
else
  echo "llama-server is healthy!"
fi

if [[ -f "$ENV_FILE" ]]; then
  if grep -q "^LLM_MODEL=" "$ENV_FILE"; then
    sed -i "s/^LLM_MODEL=.*/LLM_MODEL=\"$ALIAS\"/" "$ENV_FILE"
  else
    echo "LLM_MODEL=\"$ALIAS\"" >> "$ENV_FILE"
  fi
  echo "Updated .env -> LLM_MODEL=\"$ALIAS\""
fi

echo "Done! Switched to $TARGET ($ALIAS)."
