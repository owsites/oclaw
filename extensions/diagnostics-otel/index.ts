import type { OpenWolfPluginApi } from "openwolf/plugin-sdk";
import { emptyPluginConfigSchema } from "openwolf/plugin-sdk";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenWolfPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
