#!/bin/bash
# Bash script to start the MCP API server

echo "Starting MCP API Server..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the server
echo "Starting server on http://localhost:3001"
node mcp-api-server.js

