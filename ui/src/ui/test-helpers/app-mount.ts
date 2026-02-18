import { afterEach, beforeEach } from "vitest";
import { OpenWolfApp } from "../app.ts";

// oxlint-disable-next-line typescript/unbound-method
const originalConnect = OpenWolfApp.prototype.connect;

export function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("openwolf-app") as OpenWolfApp;
  document.body.append(app);
  return app;
}

export function registerAppMountHooks() {
  beforeEach(() => {
    OpenWolfApp.prototype.connect = () => {
      // no-op: avoid real gateway WS connections in browser tests
    };
    window.__OPENWOLF_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    OpenWolfApp.prototype.connect = originalConnect;
    window.__OPENWOLF_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });
}
