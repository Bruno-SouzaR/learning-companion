#!/usr/bin/env bash
set -e

# Ensure local LLM server on Intel Arc 140V (Vulkan iGPU) is active on port 8085
if ! curl -s http://127.0.0.1:8085/health > /dev/null 2>&1; then
  echo "Starting Gemma 4 E4B on port 8085..."
  /var/home/brunosouzar/.local/bin/llama-server \\
    -m /var/home/brunosouzar/.local/share/models/google_gemma-4-E4B-it-Q5_K_M.gguf \\
    --alias gemma-4-e4b \\
    -ngl 99 \\
    -t 4 \\
    -c 16384 \\
    -np 1 \\
    -fa on \\
    -ctk q8_0 -ctv q8_0 \\
    --reasoning off \\
    --reasoning-budget 0 \\
    --host 127.0.0.1 \\
    --port 8085 \\
    --temp 0.2 > /dev/null 2>&1 &
  sleep 4
fi

echo "=========================================================="
echo "🧠 Local LLM: Gemma 4 E4B Q5_K_M + GLM-OCR on Intel Arc 140V (Vulkan iGPU)"
echo "🌐 Web App:   http://localhost:3000"
echo "=========================================================="

exec pnpm start
