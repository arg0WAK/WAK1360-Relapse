import { establishPrimitive } from "./webkit.js";
import { installWindowP } from "./utils/mem.js";
import { main } from "./main.js";
import { sendElf, mapElf } from "./kexp.js";

let STRINGS = {
  events: {
    PROC_INIT: {
      text: "installing system check...",
      status: "warning",
      indicator: "INSTALLING",
    },
  },
  states: {
    INSTALLING: {
      text: "INSTALLING",
      status: "warning",
    },
  },
};

const isInstaller = !!document.querySelector(
  'meta[name="type"][content="installer"]',
);
const dot = document.querySelector(".dot");
const indicator = document.querySelector("#indicator");
const tag = document.querySelector("#consoleTag");
const logEl = document.querySelector("pre");

const ORCHESTRATOR = {
  fileUrl: "/install/payloads/orchestrator.elf",
  fileName: "orchestrator.elf,",
};

export const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

class FirmwareError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

function format(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? params[key] : match,
  );
}

export function log(key, params = {}, status) {
  const now = new Date();
  const timestamp = now.toLocaleString().replace(", ", " ").split(" ")[1];

  const colors = {
    info: "var(--accent)",
    warning: "var(--warn)",
    success: "var(--succ)",
    error: "var(--err)",
    faint: "var(--fg-faint)",
    dim: "var(--fg-dim)",
  };

  const statusToClass = {
    success: "succ",
    warning: "warn",
    error: "err",
    info: "idle",
  };

  const entry = STRINGS.events?.[key];
  const template = entry ? entry.text : key;
  const finalStatus = status ?? entry?.status ?? "info";
  const msg = format(template, params);

  logEl.innerHTML += `&nbsp;&nbsp;<span style="color: ${colors.faint}">${timestamp}</span> <span style="color: ${colors.dim}">»</span> <span style="color: ${colors[finalStatus] || colors.info}">${msg}</span>\n`;
  logEl.scrollTop = logEl.scrollHeight;

  if (entry?.indicator) {
    const stateEntry = STRINGS.states?.[entry.indicator];
    if (stateEntry) {
      dot.classList.remove("ok", "warn", "err", "idle");
      tag.classList.remove("ok", "warn", "err", "idle");
      dot.classList.add(statusToClass[stateEntry.status] || "err");
      tag.classList.add(statusToClass[stateEntry.status] || "err");
      indicator.textContent = stateEntry.text;
      tag.textContent = stateEntry.text;
    }
  }
}

async function loadStrings(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    STRINGS = await response.json();
  } catch (error) {
    console.error("Failed to load strings:", error);
  }
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(url, ms = 500, options = {}) {
  if (ms <= 0) return fetch(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const fetchOptions = { ...options, signal: controller.signal };
  return fetch(url, fetchOptions).finally(() => clearTimeout(timer));
}

export async function fetchWithRetry(url, maxRetries = 15, retryDelay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetchWithTimeout(url, 3000);
      return response;
    } catch (e) {
      const isNetworkError =
        e.message.includes("Load failed") ||
        e.message.includes("Failed to fetch") ||
        e.name === "TypeError";

      if (isNetworkError && i < maxRetries - 1) {
        console.log(
          `[RETRY] TCP is busy, attempting to retry (${i + 1}/${maxRetries}): ${url}`,
        );
        await sleep(retryDelay);
      } else {
        throw e;
      }
    }
  }
}

async function checkFileExists(fileUrl) {
  const fileName = fileUrl.split("/").pop();
  try {
    const response = await fetchWithTimeout(fileUrl, 3000, {
      method: "GET",
    });
    const contentType = response.headers.get("Content-Type");
    if (
      response.ok &&
      contentType &&
      contentType.includes("application/octet-stream")
    ) {
      log("PL_FOUND", { file: fileName });
      return true;
    } else {
      log("PL_ERR_LOAD", { file: fileName, err: "File not found" });
      return false;
    }
  } catch (error) {
    log("PL_ERR_LOAD", { file: fileName, err: error.message });
    return false;
  }
}

function checkFirmwareOnLoad() {
  try {
    if (typeof window.firmware === "undefined") {
      throw new FirmwareError("SYS_MISS");
    }

    const rejectMsg = window.firmware.rejection();
    if (rejectMsg) {
      throw new FirmwareError("SYS_FAIL", rejectMsg);
    }

    log("SYS_OK", { fw: window.fw_str || "UNKNOWN" });
    return true;
  } catch (e) {
    const code = e instanceof FirmwareError ? e.code : "ERR_FATAL";
    log(code, { err: e.message, msg: e.message });
    return false;
  }
}

async function getPrimitive() {
  log("WEBKIT_START");
  const primitive = installWindowP(await establishPrimitive());
  if (!primitive || typeof primitive.read8 !== "function")
    throw new Error("Memory primitive unavailable");

  log("ARW ready");
  return primitive;
}

function getWebKitBase() {
  const ctor = globalThis.__ps5NativeCtor;

  if (
    typeof ctor !== "number" ||
    typeof OFFSET_wk_host_constructor_candidates === "undefined"
  )
    throw new Error("WebKit base inputs are unavailable");

  for (const offset of OFFSET_wk_host_constructor_candidates) {
    const base = ctor - offset;
    if (base >= 0x800000000 && base < 0x900000000 && base % 0x4000 === 0)
      return base;
  }

  throw new Error("WebKit base not found");
}

async function run() {
  try {
    const orchestratorExists = await checkFileExists(ORCHESTRATOR.fileUrl);
    if (!orchestratorExists) {
      log("PL_ERR_LOAD", {
        file: ORCHESTRATOR.fileName,
        err: "File not found",
      });
      return false;
    }

    await loadScript(`/app/offsets/${window.fw_str}.js`);
    await loadScript("/app/js/rop.js");
    await loadScript("/app/js/utils/syscalls.js");
    await import("./relapse_exploit.js");
    log("CREDITS");
    log(`Agent: ${navigator.userAgent}`);
    log(`Firmware: ${window.fw_str}`);
    const primitive = await getPrimitive();
    log(`WebKit base: 0x${getWebKitBase().toString(16)}`);

    const result = await main(primitive);
    const MAP = await mapElf(ORCHESTRATOR.fileUrl, result.p, result.chain);
    await sendElf(ORCHESTRATOR.fileName, MAP, result.p, result.chain);

    return true;
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), {}, "error");
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadStrings("/app/json/strings.json").then(async () => {
    await loadScript("/app/js/firmware.js");
    const fwValid = checkFirmwareOnLoad();
    const isAppReady = (ready) => {
      window.isAppReady = ready;
      document.dispatchEvent(new CustomEvent("app:ready", { detail: ready }));
    };

    if (!fwValid) {
      return;
    }

    if (isInstaller) {
      isAppReady(false);
      return;
    }

    const isSuccess = await run();

    if (isSuccess) {
      isAppReady(true);
    }
  });
});

log("PROC_INIT");

const BASE = "http://127.0.0.1:11110";

async function install() {
  try {
    log("Installing WAK1360-Relapse Autoloader Application...");
    await fetchWithTimeout("/install", 0);
    await fetchWithRetry(`${BASE}/clear_tasks`);
    await fetchWithRetry(`${BASE}/add_task?name=OnionHEN.elf&delay=10`);
    await fetchWithRetry(`${BASE}/trigger_sequence`);
    log(
      "WAK1360-Relapse Autoloader Application installed successfully. Please wait for restart SceShellUI",
      "success",
    );
  } catch (e) {
    if (e.name === "AbortError") {
      log("Request timeout: " + e.message, "error");
    } else {
      log("Request failed: " + e.message, "error");
    }
  }
}

const cache = window.applicationCache;
let cacheState = "unknown";
let installed = false;

if (cache) {
  cache.addEventListener("cached", () => {
    cacheState = "fresh";
  });
  cache.addEventListener("noupdate", () => {
    cacheState = "existing";
  });
  cache.addEventListener("updateready", () => {
    try {
      cache.swapCache();
    } catch (e) {}
    cacheState = "updated";
  });
  cache.addEventListener("error", () => {
    cacheState = "error";
  });
  cache.addEventListener("obsolete", () => {
    cacheState = "error";
  });
}

function installOnce() {
  if (installed) return;
  installed = true;
  install();
}

function waitForCache(timeout = 15000) {
  return new Promise((resolve) => {
    if (!cache || cache.status === cache.UNCACHED) {
      return resolve("none");
    }

    const done = () => {
      if (cache.status === cache.UPDATEREADY) {
        try {
          cache.swapCache();
        } catch (e) {}
        return resolve("updated");
      }
      resolve(cacheState);
    };

    if (cache.status === cache.IDLE) {
      return done();
    }

    const events = ["cached", "noupdate", "updateready", "error", "obsolete"];
    events.forEach((ev) => {
      cache.addEventListener(ev, done, { once: true });
    });

    setTimeout(done, timeout);
  });
}

document.addEventListener("app:ready", async (e) => {
  if (e.detail === false) {
    log(
      "Preparing to install WAK1360-Relapse Autoloader Application",
      { indicator: "INSTALLING" },
      "warning",
    );

    const result = await waitForCache();

    switch (result) {
      case "fresh":
        log("Caching complete.", "success");
        break;
      case "existing":
        log("Already cached, no update needed.");
        break;
      case "updated":
        log("Update found, applying...", "warning");
        break;
      case "none":
        log("No cache found, installing...");
        break;
      default:
        log("Cache failed. Run the installer again.", "error");
        return;
    }

    installOnce();
  } else if (e.detail === true) {
    try {
      log("Application is ready. Proceeding with execution...", {}, "success");
      await fetchWithRetry(`${BASE}/clear_tasks`);

      log("Adding task: OnionHEN.elf");
      await fetchWithRetry(`${BASE}/add_task?name=OnionHEN.elf&delay=10`);

      log("Triggering sequence...", {}, "warning");
      await fetchWithRetry(`${BASE}/trigger_sequence`);
    } catch (err) {
      log("Error: " + err, {}, "error");
    }
  }
});
