import { captureEnv } from "../test-utils/env.js";

export function snapshotStateDirEnv() {
  return captureEnv(["OPENWOLF_STATE_DIR", "WOLFBOT_STATE_DIR"]);
}

export function restoreStateDirEnv(snapshot: ReturnType<typeof snapshotStateDirEnv>): void {
  snapshot.restore();
}

export function setStateDirEnv(stateDir: string): void {
  process.env.OPENWOLF_STATE_DIR = stateDir;
  delete process.env.WOLFBOT_STATE_DIR;
}
