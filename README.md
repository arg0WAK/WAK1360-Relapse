![WAK1360-Relapse Banner](https://arg0wak.github.io/gist/images/WAK1360-Relapse/G6Y0J8OMHIL4E32I.webp)

**W.A.K.** (**W**ebKit **A**utomated **K**ernel) 1360-Relapse is an optimized WebKit and Kernel exploit host supporting PlayStation 5 firmware versions 7.00 through 13.60.

This release introduces a redesigned **One-Tap Autoloader** architecture, streamlining the exploitation and payload injection pipeline into a single automated workflow with minimal user interaction.

The entire previous build has been completely overhauled, and the chain’s execution process has been reorganized with a focus on speed and stability.

## Features

- **Broad Firmware Support:** Dynamic offset loading for PS5 firmwares 7.00 through 13.60.

- **One-Tap Autoloader:** A completely automated pipeline that triggers the WebKit exploit, achieves kernel execution, and spawns the payload orchestrator in a single flow.

- **Zero-Footprint Execution:** Utilizes an ES Module (ESM) bundler (`esbuild`) and Inline Web Workers to eliminate disk I/O bottlenecks, MIME-type blocks, and memory leaks during execution.

- **Beautified Interface:** A clean, console-optimized UI experience reflecting real-time chain status.

## One-Tap Architecture & Orchestration

WAK1360-Relapse integrates a heavily optimized branch of the `sce-hell0` orchestration engine. Rather than fetching and executing payloads individually over the network, the entire payload chain is embedded into a single `orchestrator.elf` file.

### Chain Improvements & Memory Allocation

- **ESM Bundling (`chain.js`):** The entire JavaScript exploit chain is bundled via `esbuild` into a single `chain.js` file. This eliminates HTTP overhead and bypasses strict browser MIME-type enforcement.

- **Inline Web Workers:** ROP slave execution is handled natively in-memory via Blob URLs, ensuring the WebKit heap is not disturbed by secondary file fetches.

- **Optimized `.rodata` Footprint:** Raw JavaScript modules and development node packages are dynamically pruned during the ELF compilation process. This ensures `orchestrator.elf` remains featherweight, preventing kernel panics caused by excessive memory allocation during the payload injection phase.

- **Robust Primitive Establishment:** Implements auto-retry and timeout mechanics for memory grooming, guaranteeing exceptional reliability during the initial exploitation phase.

> **Note on Orchestrator Compilation:**
> If you wish to compile the `orchestrator.elf` from source, modify the C backend, or change the embedded payload capacity, please refer to the upstream [**sce-hell0 repository**](https://github.com/arg0WAK/sce-hell0) for comprehensive build instructions.

## Build Prerequisites & Bundling

Before triggering the C compilation via `make`, you must bundle the modular JavaScript source files into the optimized single-entry script (`chain.js`) using `esbuild`.

Navigate to the `app/` directory, install dependencies (if not already done), and run the build script:

```bash
cd app
npm install
npm run build
cd ..
```

This ensures `dist/js/chain.js` is generated and ready to be embedded into the orchestrator ELF without bloating the `.rodata` section with raw source files.

## Directory Structure

```
├── app
│   ├── build.mjs                 # esbuild configuration script (Excluded at build time)
│   ├── cache.appcache
│   ├── css
│   │   └── index.css
│   ├── dist
│   │   └── js
│   │       └── chain.js      # Bundled production script
│   ├── index.html
│   ├── js
│   │   ├── firmware.js
│   │   ├── helper.js
│   │   ├── kexp.js               # (Excluded at build time - bundled into chain.js)
│   │   ├── main.js               # (Excluded at build time - bundled into chain.js)
│   │   ├── relapse_exploit.js    # (Excluded at build time - bundled into chain.js)
│   │   ├── rop.js
│   │   ├── utils
│   │   │   ├── int64.js          # (Excluded at build time - bundled into chain.js)
│   │   │   ├── mem.js            # (Excluded at build time - bundled into chain.js)
│   │   │   └── syscalls.js
│   │   └── webkit.js             # (Excluded at build time - bundled into chain.js)
│   ├── json
│   │   └── strings.json          # Localized log templates and strings
│   ├── offsets/                  # Firmware-specific offset files (33 versions supported)
│   ├── package.json              # (Excluded at build time)
│   ├── package-lock.json         # (Excluded at build time)
│   └── payloads
│       ├── elfldr.elf
│       ├── kexp_2026_05_25.bin
│       └── orchestrate
│           └── OnionHEN.elf
├── assets
│   └── icon0.png
├── include
│   └── microhttpd.h
├── install
│   └── index.html
├── lib
│   └── libmicrohttpd.a
├── LICENSE
├── main.c
├── Makefile
├── orchestrator.c
├── README.md
└── tools
    ├── gen_assets.sh
    └── gen_payloads.sh
```

## Deployment and Usage

### 1. PS5 User's Guide via Custom DNS (Recommended)

This method provides the most integrated experience by routing the native PS5 User's Guide directly to the host.

1. On your PS5, go to **Settings** > **Network** > **Settings** > **Set Up Internet Connection**.

2. Set **DNS Settings** to **Manual**:
   - **Primary DNS:** Your Host/Server IP (e.g., `35.209.229.156`)

   - **Secondary DNS:** `0.0.0.0`

   > **Warning:** Never specify an external secondary DNS (such as `8.8.8.8` or `1.1.1.1`). An active secondary DNS can bypass the sinkhole if the primary query times out, exposing your console to official update servers.

3. Navigate to **Settings** > **Guide & Tips, Health & Safety, and Other Information** > **Guide and Tips** > **User's Guide** to launch the exploit host.

### 2. Direct Web Hosting (GitHub Pages)

If you prefer not to host the server locally or modify your DNS settings, you can access the exploit host directly via GitHub Pages.

1. Ensure your PS5 is connected to a local network with internet access.

2. If you’ve installed a fake web browser via a previous exploit chain, go to the following address:
   `https://arg0wak.github.io/WAK1360-Relapse`

3. Follow the on-screen prompts to initialize the exploit chain.

## Technical Notes & Limitations

- **IMPORTANT:** The PS5 KASLR leak relies on opening a routing socket (`SYS_SOCKET` with `AF_ROUTE`). If the payload is loaded entirely offline via AppCache, the console lacks an assigned IP address on any network interface, causing the routing table query to fail (`kaslr: no interface has an address`). **The PS5 must have an active LAN/Network connection to succeed.**

- **Manuals Page (Cache Issue):** If you have configured the custom DNS but the User's Guide still loads the official Sony `manuals.playstation.net` page, the console is stuck loading a cached version. To resolve this:
  1. Completely disconnect from the internet (forget the Wi-Fi/LAN network if possible).

  2. Toggle off **"Connect to the Internet"** in the Network settings.

  3. Navigate to **Settings** > **System** > **Web Browser** and clear both your cookies and website data.

  4. Reconnect to your network freshly and _immediately_ apply your custom DNS address during the setup process.

  5. Relaunch the User's Guide.

## Credits

This project is built upon the foundational research, tools, and relentless dedication of the PlayStation scene. We would like to extend our deepest gratitude to the following developers and researchers for making this exploit chain possible:

**ntfargo, ufm42, Sonic_Iso, Jordy, Dr. Yenyen, TheFlow, SlidyBat, Flatz, cow, nhk, bollarz, Sleirsgoevy, EchoStretch,** and **EarthOnion**.

Also, thanks to **0xp0co** (aydencharles) for OnionHEN and to **notmaj0r** for the 11.40 offsets.

## Contributing

Contributions are welcome, provided they bring meaningful improvements to the project.

Pull requests are reviewed manually. Submissions that are low-effort, AI-generated without meaningful review, unrelated to the project's goals, or otherwise of insufficient quality may be rejected.

If you redistribute this project or publish a derivative work, comply with the GPL-3.0 license and preserve applicable copyright and license notices. Credit the original project and link to the upstream repository where reasonably possible.

By submitting a contribution, you agree that your contribution is provided under the project's GPL-3.0 license.
