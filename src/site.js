import { establishPrimitive } from "./webkit.js";
import { installWindowP } from "./utils/mem.js";

const cstat = document.getElementById("cstat");

function writeEvent(name, detail, type) {
  window.writeLog(detail == null || detail === "" ? name : `${name}: ${detail}`,
    type || (name === "Failed" ? "error" : "i"));
}

window.jb = { mark: writeEvent };

async function getPrimitive() {
  window.writeLog("Starting WebKit exploit", "i");
  const primitive = installWindowP(await establishPrimitive(writeEvent));
  if (!primitive || typeof primitive.read8 !== "function")
    throw new Error("Memory primitive unavailable");

  window.writeLog("ARW ready", "g");
  return primitive;
}

function getWebKitBase() {
  const ctor = globalThis.__ps5NativeCtor;
  if (typeof ctor !== "number" || typeof OFFSET_wk_host_constructor_candidates === "undefined")
    throw new Error("WebKit base inputs are unavailable");

  for (const offset of OFFSET_wk_host_constructor_candidates) {
    const base = ctor - offset;
    if (base >= 0x800000000 && base < 0x900000000 && base % 0x4000 === 0)
      return base;
  }

  throw new Error("WebKit base not found");
}

async function run() {
  const rejection = window.firmware.rejection();
  if (rejection)
    throw new Error(rejection);
  window.writeLog("Credits: ntfargo, ufm42, Sonic_Iso, Jordy, Dr. Yenyen, TheFlow, SlidyBat, Flatz, cow, nhk, bollarz, Sleirsgoevy, EchoStretch, EarthOnion", "i");
  window.writeLog(`Agent: ${navigator.userAgent}`, "i");
  window.writeLog(`Firmware: ${window.fw_str}`, "i");
  const primitive = await getPrimitive();
  window.writeLog(`WebKit base: 0x${getWebKitBase().toString(16)}`, "g");

  await import("./relapse_exploit.js");
  await main(primitive);
}

window.runRelapseExploit = async function () {
  try {
    await run();
    if (cstat) {
      cstat.textContent = 'DONE';
      cstat.style.color = 'var(--green)';
    }
  } catch (error) {
    window.writeLog(error instanceof Error ? error.message : String(error), "e");
    if (cstat) {
      cstat.textContent = 'FAILED';
      cstat.style.color = 'var(--red)';
    }
  }
};