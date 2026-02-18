import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "openwolf", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "openwolf", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "openwolf", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "openwolf", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "openwolf", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "openwolf", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "openwolf", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "openwolf"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "openwolf", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "openwolf", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "openwolf", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "openwolf", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "openwolf", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "openwolf", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "openwolf", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "openwolf", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "openwolf", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "openwolf", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "openwolf", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "openwolf", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "openwolf", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "openwolf", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["node", "openwolf", "status"],
    });
    expect(nodeArgv).toEqual(["node", "openwolf", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["node-22", "openwolf", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "openwolf", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["node-22.2.0.exe", "openwolf", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "openwolf", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["node-22.2", "openwolf", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "openwolf", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["node-22.2.exe", "openwolf", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "openwolf", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["/usr/bin/node-22.2.0", "openwolf", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "openwolf", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["nodejs", "openwolf", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "openwolf", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["node-dev", "openwolf", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "openwolf", "node-dev", "openwolf", "status"]);

    const directArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["openwolf", "status"],
    });
    expect(directArgv).toEqual(["node", "openwolf", "status"]);

    const bunArgv = buildParseArgv({
      programName: "openwolf",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "openwolf",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "openwolf", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "openwolf", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "config", "get", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "config", "unset", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "models", "list"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "models", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "openwolf", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "openwolf", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["config", "get"])).toBe(false);
    expect(shouldMigrateStateFromPath(["models", "status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
