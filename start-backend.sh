#!/bin/bash
# Bash script to start the DataForSEO backend server
# Run this from the project root directory

echo "Starting DataForSEO MCP API Server..."
echo ""

# Check if server directory exists
if [ ! -f "server/mcp-api-server.js" ]; then
    echo "❌ Error: server/mcp-api-server.js not found!"
    echo "Please run this script from the project root directory."
    exit 1
fi

# Check if node_modules exists in server directory
if [ ! -d "server/node_modules" ]; then
    echo "⚠️  Dependencies not installed. Installing..."
    cd server
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies!"
        exit 1
    fi
    cd ..
    echo "✅ Dependencies installed!"
    echo ""
fi

# Start the server
echo "🚀 Starting server on http://localhost:3001..."
echo "Press Ctrl+C to stop the server"
echo ""

cd server
node mcp-api-server.js

