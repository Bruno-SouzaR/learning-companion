#!/usr/bin/env bash
set -e

# Ensure local LLM server on Intel Arc 140V (Vulkan iGPU) is active
systemctl --user start learning-llm.service

echo "=========================================================="
echo "🧠 Local LLM: Qwen 3.5 2B Q8 on Intel Arc 140V (Vulkan iGPU)"
echo "🌐 Web App:   http://localhost:3000"
echo "=========================================================="

exec pnpm start
