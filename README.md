![WAK1360-Relapse Injection Page](https://arg0wak.github.io/gist/images/WAK1360-Relapse/G6Y0J8OMHIL4E32I.webp)

**W.A.K.** (**W**ebKit **A**utomated **K**ernel) 1360-Relapse is a comprehensive WebKit and Kernel exploit host designed for PlayStation 5 firmware versions ranging from 7.00 to 13.60.

Features
--------

*   **Broad Firmware Support:** Dynamic offset loading for PS5 firmwares 7.00 through 13.60.
*   **Prioritized Payload Injection:** Sequential execution of customized payloads defined via `payloads.json`.
*   **Beautified Interface:** A clean, console-optimized UI experience.

Directory Structure
-------------------

    ├── assets/
    │   └── index.css
    ├── index.html
    ├── offsets/
    │   ├── 7.00.js to 13.60.js (33 offset files)
    ├── payloads/
    │   ├── elfldr-ps5-1360.elf
    │   ├── kexp_2026_05_25.bin
    │   ├── kstuff.elf
    │   ├── nanodns.elf
    │   ├── OnionHEN.elf
    │   ├── payloads.json
    │   └── shadowmountplus.elf
    ├── README.md
    ├── serve.py
    └── src/
        ├── firmware.js
        ├── helper.js
        ├── kexp.js
        ├── main.js
        ├── relapse_exploit.js
        ├── rop.js
        ├── site.js
        ├── utils/
        │   ├── int64.js
        │   ├── mem.js
        │   ├── rop_slave.js
        │   └── syscalls.js
        └── webkit.js

Supported Payloads & Configuration
----------------------------------

By default, the host supports the optional activation of **kstuff**, **nanoDNS**, **OnionHEN**, and **ShadowMount+**.

To integrate additional payloads, place the relevant `.elf` files into the `payloads/` directory and register them within the `payloads.json` file.

**Configuration & Priority:** The order of the arrays in `payloads.json` strictly determines the payload injection priority. Based on the configuration below, `OnionHEN` will be executed first. The `"bolt"` string is simply a UI icon identifier and can remain static.

    [
        [
            "bolt",
            "OnionHEN",
            "v0.0.13 · 4.225 KB",
            "OnionHEN.elf",
            3000
        ],
        [
            "bolt",
            "kstuff",
            "v0.1.11 · 1.697 KB",
            "kstuff.elf",
            3000
        ],
        [
            "bolt",
            "ShadowMount+",
            "v0.1.7b2 · 2.381 KB",
            "shadowmountplus.elf",
            3000
        ],
        [
            "bolt",
            "nanoDNS",
            "v0.4 · 130 KB",
            "nanodns.elf",
            3000
        ]
    ]

Deployment and Usage
--------------------

### 1\. PS5 User's Guide via Custom DNS (Recommended)

This method provides the most integrated experience by routing the native PS5 User's Guide directly to the host.

1.  On your PS5, go to **Settings** > **Network** > **Settings** > **Set Up Internet Connection**.
2.  Set **DNS Settings** to **Manual**:
    *   **Primary DNS:** Your Host/Server IP (e.g., `35.209.229.156`)
    *   **Secondary DNS:** `0.0.0.0`
    > **Warning:** Never specify an external secondary DNS (such as `8.8.8.8` or `1.1.1.1`). An active secondary DNS can bypass the sinkhole if the primary query times out, exposing your console to official update servers.
3.  Navigate to **Settings** > **Guide & Tips, Health & Safety, and Other Information** > **Guide and Tips** > **User's Guide** to launch the exploit host.

### 2\. Local Deployment (serve.py)

Unlike the Five Server deployment in WAK505-Core, this project utilizes NathanFargo's `serve.py` for lightweight local network deployment.

1.  Ensure Python 3 is installed on your host machine.
2.  Navigate to the project root directory and start the server:
    
        python3 serve.py
    
3.  Note the local IP address and port of your host machine.

### 3\. Direct Web Hosting (GitHub Pages)

If you prefer not to host the server locally or modify your DNS settings, you can access the exploit host directly via GitHub Pages.

1.  Ensure your PS5 is connected to a local network with internet access.
2.  If you’ve installed a fake web browser via the previous exploit chain, or if you’ve gained access to the web browser using standard messaging/connection workarounds, go to the following address: 
    `https://arg0wak.github.io/WAK1360-Relapse`
3.  Follow the on-screen prompts to initialize the exploit chain.

Technical Notes & Limitations
-----------------------------

*   **AppCache / Offline Support Removed:** The `cache.manifest` feature has been intentionally removed. The PS5 KASLR leak relies on opening a routing socket (`SYS_SOCKET` with `AF_ROUTE`). If the payload is loaded entirely offline via AppCache, the console lacks an assigned IP address on any network interface, causing the routing table query to fail (`kaslr: no interface has an address`). **The PS5 must have an active LAN/Network connection to succeed.**

*   **Manuals Page (Cache Issue):** If you have configured the custom DNS but the User's Guide still loads the official Sony `manuals.playstation.net` page, the console is stuck loading a cached version. To resolve this:
    1.  Completely disconnect from the internet (forget the Wi-Fi/LAN network if possible).
    2.  Toggle off **"Connect to the Internet"** in the Network settings.
    3.  Navigate to **Settings** > **System** > **Web Browser** and clear both your cookies and website data.
    4.  Reconnect to your network freshly and _immediately_ apply your custom DNS address during the setup process.
    5.  Relaunch the User's Guide.

Credits
-------
This project is built upon the foundational research, tools, and relentless dedication of the PlayStation scene. We would like to extend our deepest gratitude to the following developers and researchers for making this exploit chain possible:

**ntfargo, ufm42, Sonic\_Iso, Jordy, Dr. Yenyen, TheFlow, SlidyBat, Flatz, cow, nhk, bollarz, Sleirsgoevy, EchoStretch,** and **EarthOnion**.

Also thanks **0xp0co** (aydencharles) for OnionHEN.