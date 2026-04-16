#!/usr/bin/env node

import server from './server.js';
import log from './logger.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http from 'node:http';

const args = process.argv.slice(2);
const useHttpStream = args.includes('--httpStream');
const port =
  args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || '8080';

async function startServer(): Promise<void> {
  log.info('Starting MCP Appium MCP Server...');

  try {
    if (useHttpStream) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const httpServer = http.createServer(async (req, res) => {
        await transport.handleRequest(req, res);
      });
      httpServer.listen(parseInt(port, 10), () => {
        log.info(
          `Server started with httpStream transport on http://localhost:${port}`
        );
      });
      await server.mcpServer.connect(transport);
    } else {
      const transport = new StdioServerTransport();
      await server.mcpServer.connect(transport);
      log.info('Server started with stdio transport');
    }
  } catch (error: any) {
    log.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer();
