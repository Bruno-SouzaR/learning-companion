#!/usr/bin/env bash
set -e

# Ensure local LLM server on Intel Arc 140V (Vulkan iGPU) is active
if ! curl -s http://127.0.0.1:8080/health > /dev/null 2>&1; then
  systemctl --user start learning-llm.service || true
fi

echo "=========================================================="
echo "🧠 Local LLM: Gemma 4 E4B Q5_K_M (65k Q8 KV) on Intel Arc 140V (Vulkan iGPU)"
echo "🌐 Web App:   http://localhost:3000"
echo "=========================================================="

exec pnpm start
