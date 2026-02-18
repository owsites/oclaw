import type {
  AnyAgentTool,
  OpenWolfPluginApi,
  OpenWolfPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: OpenWolfPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as OpenWolfPluginToolFactory,
    { optional: true },
  );
}
