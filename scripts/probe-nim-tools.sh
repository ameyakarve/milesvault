#!/usr/bin/env bash
# Verify whether NIM's OpenAI-compatible endpoint (via Cloudflare AI Gateway)
# returns native OpenAI `tool_calls` for Kimi K2 when `tools` is in the request
# body, or leaks Kimi native tokens into `content`.
#
# Usage:
#   CF_AIG_TOKEN=<token> \
#   CLOUDFLARE_ACCOUNT_ID=<id> \
#   AI_GATEWAY_NAME=<name> \
#   CHAT_MODEL=moonshotai/kimi-k2-instruct \
#   ./scripts/probe-nim-tools.sh
#
# (Vars are auto-loaded from .dev.vars if present.)

set -eu

if [ -f .dev.vars ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.dev.vars
  set +a
fi

: "${CF_AIG_TOKEN:?CF_AIG_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"
: "${AI_GATEWAY_NAME:?AI_GATEWAY_NAME must be set}"
: "${CHAT_MODEL:=moonshotai/kimi-k2-instruct}"

URL="https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${AI_GATEWAY_NAME}/custom-nvidia-nim/chat/completions"

BODY=$(cat <<JSON
{
  "model": "${CHAT_MODEL}",
  "stream": false,
  "max_tokens": 256,
  "messages": [
    { "role": "system", "content": "You are a helpful assistant. Use tools when appropriate." },
    { "role": "user",   "content": "What is the weather in San Francisco right now? Call the tool." }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather for a location.",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string", "description": "City name" }
          },
          "required": ["location"],
          "additionalProperties": false
        }
      }
    }
  ],
  "tool_choice": "auto"
}
JSON
)

echo "==> POST ${URL}" >&2
echo "==> model=${CHAT_MODEL}" >&2
echo "==> tools: [get_weather]" >&2
echo >&2

curl -sS -X POST "${URL}" \
  -H "cf-aig-authorization: Bearer ${CF_AIG_TOKEN}" \
  -H "content-type: application/json" \
  --data-binary "${BODY}"
echo
