# MCP API Server Setup

The keyword research features require a backend server to call DataForSEO MCP tools. Follow these steps to set it up:

## Quick Start

1. **Navigate to the server directory:**
   ```bash
   cd server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

The server will run on `http://localhost:3001`

## Configuration

The server is pre-configured with DataForSEO credentials:
- **API Login:** Set via env `DATAFORSEO_API_LOGIN`
- **API Password:** Set via env `DATAFORSEO_API_PASSWORD`

## Integration with MCP Server

The current `server/mcp-api-server.js` is a placeholder. To make it work with actual MCP tools, you need to:

1. **Install MCP SDK:**
   ```bash
   npm install @modelcontextprotocol/sdk
   ```

2. **Configure MCP Client:**
   Update `server/mcp-api-server.js` to connect to your MCP server and call the DataForSEO tools.

3. **Example MCP Client Setup:**
   ```javascript
   const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
   
   const client = new Client({
     name: 'keyword-research-server',
     version: '1.0.0',
   }, {
     capabilities: {
       tools: {},
     },
   });
   
   // Connect to MCP server (stdio, SSE, or HTTP)
   await client.connect();
   
   // Call MCP tool
   const result = await client.callTool({
     name: toolName,
     arguments: params,
   });
   ```

## Development Setup

1. **Start the backend server:**
   ```bash
   cd server
   npm start
   ```

2. **Start the frontend (in a separate terminal):**
   ```bash
   npm run dev
   ```

The Vite dev server is configured to proxy `/api/mcp/*` requests to `http://localhost:3001`.

## Environment Variables

You can customize the backend URL by creating a `.env` file:

```env
VITE_MCP_API_BASE=http://localhost:3001/api/mcp
```

## Troubleshooting

- **404 Error:** Make sure the backend server is running on port 3001
- **Connection Refused:** Check that the server started successfully
- **MCP Tool Errors:** Ensure your MCP server is configured with DataForSEO credentials

## Production Deployment

For production, deploy the backend server and update `VITE_MCP_API_BASE` to point to your production backend URL.

