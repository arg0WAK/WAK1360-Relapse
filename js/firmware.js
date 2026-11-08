"use strict";

const supportedFirmware = [
  "13.60",
  "13.42",
  "13.40",
  "13.20",
  "13.00",
  "12.70",
  "12.60",
  "12.40",
  "12.20",
  "12.02",
  "12.00",
  "11.60",
  "11.40",
  "11.20",
  "11.00",
  "10.60",
  "10.40",
  "10.20",
  "10.01",
  "10.00",
  "9.60",
  "9.40",
  "9.20",
  "9.00",
  "8.60",
  "8.40",
  "8.20",
  "8.00",
  "7.61",
  "7.60",
  "7.40",
  "7.20",
  "7.01",
  "7.00",
];

const firmwareUserAgent = navigator.userAgent || "";

function detectFirmware(ua) {
  let m = /PlayStation 5\/(\d+\.\d+)/.exec(ua);
  if (m) return m[1];
  m = /\b(1[0-3]\.\d{2}|[7-9]\.\d{2})\b/.exec(ua);
  if (m && supportedFirmware.includes(m[1])) return m[1];
  return "";
}

const firmwareVersion = detectFirmware(firmwareUserAgent);

window.fw_str = firmwareVersion;
window.fw_ua = firmwareUserAgent;
window.firmware = {
  rejection() {
    if (!/PlayStation\s*5/i.test(firmwareUserAgent)) {
      return "PlayStation 5 Required";
    }
    if (!firmwareVersion) {
      return "FW version not found in UA";
    }
    if (!supportedFirmware.includes(firmwareVersion)) {
      return "FW " + firmwareVersion + " is not supported";
    }
    return null;
  },
};
