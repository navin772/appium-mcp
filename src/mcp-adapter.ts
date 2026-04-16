/**
 * Adapter layer: wraps the official @modelcontextprotocol/sdk McpServer
 * with the same `addTool()` / `addResource()` interface that tool files
 * were written against (previously supplied by fastmcp).
 *
 * This lets us migrate the server backbone to the official SDK while
 * keeping per-tool diffs to a single import-line change.
 *
 * Advanced SDK features (elicitation, structuredContent, progress) are
 * exposed as additional helpers — tools opt in to them individually.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
  ElicitResult, ToolAnnotations
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

export type ContentResult = CallToolResult;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export type ElicitFormField =
  | { type: 'string'; description?: string; default?: string }
  | { type: 'number'; description?: string; default?: number }
  | { type: 'boolean'; description?: string; default?: boolean }
  | {
      type: 'string';
      enum: string[];
      enumNames?: string[];
      description?: string;
      default?: string;
    };

export interface ElicitFormParams {
  message: string;
  properties: Record<string, ElicitFormField>;
  required?: string[];
}

interface ToolDef {
  name: string;
  description?: string;
  parameters?: any;
  outputSchema?: any;
  annotations?: ToolAnnotations;
  execute: (args: any, context: any) => Promise<CallToolResult | string | void>;
}

interface ResourceDef {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  load: () => Promise<any>;
}

export class AppiumMcpServer {
  readonly mcpServer: McpServer;

  constructor(info: { name: string; version: string; instructions?: string }) {
    this.mcpServer = new McpServer(
      { name: info.name, version: info.version },
      { instructions: info.instructions }
    );
  }

  addTool(def: ToolDef): void {
    const config: Record<string, unknown> = {
      description: def.description,
      annotations: def.annotations,
    };
    if (def.parameters) {
      config.inputSchema = def.parameters;
    }
    if (def.outputSchema) {
      config.outputSchema = def.outputSchema;
    }

    this.mcpServer.registerTool(
      def.name,
      config as any,
      (async (args: any, _extra: ToolExtra): Promise<CallToolResult> => {
        const result = await def.execute(args, undefined);
        if (result === undefined || result === null) {
          return { content: [] };
        }
        if (typeof result === 'string') {
          return { content: [{ type: 'text', text: result }] };
        }
        return result as CallToolResult;
      }) as any
    );
  }

  addResource(def: ResourceDef): void {
    this.mcpServer.resource(def.name, def.uri, async () => {
      const data = await def.load();
      const text =
        typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      return { contents: [{ uri: def.uri, text, mimeType: def.mimeType }] };
    });
  }

  /**
   * Elicit structured input from the user via the client.
   * Returns the result with action='accept'|'decline'|'cancel'.
   */
  async elicitInput(params: ElicitFormParams): Promise<ElicitResult> {
    return this.mcpServer.server.elicitInput({
      message: params.message,
      requestedSchema: {
        type: 'object' as const,
        properties: params.properties as any,
        required: params.required,
      },
    });
  }
}
