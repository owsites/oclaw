import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "openwolf",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "openwolf", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "openwolf", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "openwolf", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "openwolf", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "openwolf", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "openwolf", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "openwolf", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "openwolf", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".openwolf-dev");
    expect(env.OPENWOLF_PROFILE).toBe("dev");
    expect(env.OPENWOLF_STATE_DIR).toBe(expectedStateDir);
    expect(env.OPENWOLF_CONFIG_PATH).toBe(path.join(expectedStateDir, "openwolf.json"));
    expect(env.OPENWOLF_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      OPENWOLF_STATE_DIR: "/custom",
      OPENWOLF_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.OPENWOLF_STATE_DIR).toBe("/custom");
    expect(env.OPENWOLF_GATEWAY_PORT).toBe("19099");
    expect(env.OPENWOLF_CONFIG_PATH).toBe(path.join("/custom", "openwolf.json"));
  });

  it("uses OPENWOLF_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      OPENWOLF_HOME: "/srv/openwolf-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/openwolf-home");
    expect(env.OPENWOLF_STATE_DIR).toBe(path.join(resolvedHome, ".openwolf-work"));
    expect(env.OPENWOLF_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".openwolf-work", "openwolf.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("openwolf doctor --fix", {})).toBe("openwolf doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("openwolf doctor --fix", { OPENWOLF_PROFILE: "default" })).toBe(
      "openwolf doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("openwolf doctor --fix", { OPENWOLF_PROFILE: "Default" })).toBe(
      "openwolf doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("openwolf doctor --fix", { OPENWOLF_PROFILE: "bad profile" })).toBe(
      "openwolf doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("openwolf --profile work doctor --fix", { OPENWOLF_PROFILE: "work" }),
    ).toBe("openwolf --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("openwolf --dev doctor", { OPENWOLF_PROFILE: "dev" })).toBe(
      "openwolf --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("openwolf doctor --fix", { OPENWOLF_PROFILE: "work" })).toBe(
      "openwolf --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("openwolf doctor --fix", { OPENWOLF_PROFILE: "  jbopenwolf  " })).toBe(
      "openwolf --profile jbopenwolf doctor --fix",
    );
  });

  it("handles command with no args after openwolf", () => {
    expect(formatCliCommand("openwolf", { OPENWOLF_PROFILE: "test" })).toBe(
      "openwolf --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm openwolf doctor", { OPENWOLF_PROFILE: "work" })).toBe(
      "pnpm openwolf --profile work doctor",
    );
  });
});
