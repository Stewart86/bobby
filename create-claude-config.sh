#!/bin/bash

cat > .claude.json << 'EOF'
{
  "model": "claude-3-sonnet-20240229",
  "system_prompt": "You are Bobby, a helpful AI assistant."
}
EOF

echo ".claude.json created successfully."