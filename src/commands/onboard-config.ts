import type { OpenWolfConfig } from "../config/config.js";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: OpenWolfConfig,
  workspaceDir: string,
): OpenWolfConfig {
  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };
}
