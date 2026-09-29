const STRINGS = {
    SYS_FAIL: 'system check failed: {msg}',
    SYS_OK: 'firmware {fw} detected… ok',
    SYS_MISS: 'firmware module (firmware.js) is missing!',
    AUTO_EN: 'autoload enabled',
    AUTO_DIS: 'autoload disabled',
    AUTO_START: 'autoload active — starting exploit sequence...',
    AUTO_CANCEL: 'autoload canceled: incompatible firmware',
    START_INC: 'cannot start: incompatible firmware detected',
    START_NO_MAN: 'no payloads manifest. proceeding with system exploit only...',
    START_NO_SEL: 'no payload selected. proceeding with system exploit only...',
    CHAIN_MULTI: 'initiating exploit chain for {count} payload(s)...',
    CHAIN_SYS: 'initiating system exploit chain...',
    ERR_FATAL: 'fatal error: {err}',
    PL_DIS: 'payload disabled: {name}',
    PL_EN: 'payload enabled: {name}',
    PL_PREP: 'preparing optional payloads...',
    PL_LOAD: 'loading payload: {name} ({file})',
    PL_WAIT: 'waiting {ms}ms...',
    PL_SENT: '{file} sent successfully.',
    PL_ERR: 'failed to execute {file}: {err}',
    PL_DONE: 'all selected payloads processed.',
    PL_NONE: 'no optional payloads selected.',
    MAN_OK: 'payload manifest loaded… ok',
    MAN_ERR: 'failed to load payloads manifest',
    MAN_EMPTY: 'manifest empty or not loaded yet',
    READY: 'awaiting target...',
    DONE_CURSOR: 'chain completed. exiting...'
};

const logEl = document.getElementById('log');

function printLog(key, cls = '', tokens = {}, withCursor = false) {
    try {
        if (!logEl) return;

        const cur = logEl.querySelector('.cursor');
        if (cur) cur.remove();

        let text = STRINGS[key] || key;
        for (const [k, v] of Object.entries(tokens)) {
            text = text.replace(`{${k}}`, String(v));
        }

        const d = new Date();
        const ts = String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
        const cursorHtml = withCursor ? '<span class="cursor"></span>' : '';

        const html = `<div class="ln ${cls}"><span class="t">00:${ts}</span><span class="arrow">»</span><span class="msg">${text}${cursorHtml}</span></div>`;
        logEl.insertAdjacentHTML('beforeend', html);
        logEl.scrollTop = logEl.scrollHeight;
    } catch (e) {
        console.error("Logger failed:", e);
    }
}

window.writeLog = function (text, type = '') {
    const logEl = document.getElementById('log');
    if (!logEl) return;

    const cur = logEl.querySelector('.cursor');
    if (cur) cur.remove();

    let cls = '';
    type = String(type).toLowerCase();

    if (type.includes('err') || type === 'red') cls = 'e';
    else if (type.includes('succ') || type === 'ok' || type === 'green') cls = 'g';
    else if (type.includes('warn') || type === 'yellow') cls = 'a';
    else if (type.includes('info') || type === 'blue') cls = 'i';

    const d = new Date();
    const ts = String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');

    const html = `<div class="ln ${cls}"><span class="t">00:${ts}</span><span class="arrow">»</span><span class="msg">${text}</span></div>`;

    logEl.insertAdjacentHTML('beforeend', html);
    logEl.scrollTop = logEl.scrollHeight;
};

const KEY_AUTO = 'wak1360.autoload', KEY_PAYLOADS = 'wak1360.activePayloads';
let busy = false, fwIsValid = false;
let payloads = [], activePayloadIndices = [], autoload = false;

try {
    autoload = localStorage.getItem(KEY_AUTO) === '1';
    const plStr = localStorage.getItem(KEY_PAYLOADS);
    activePayloadIndices = plStr ? JSON.parse(plStr) : [];
    if (!Array.isArray(activePayloadIndices)) activePayloadIndices = [];
} catch (e) {
    activePayloadIndices = []; autoload = false;
}

const saveAuto = (state) => { try { localStorage.setItem(KEY_AUTO, state ? '1' : '0'); } catch (e) { } };
const saveActivePayloads = (arr) => { try { localStorage.setItem(KEY_PAYLOADS, JSON.stringify(arr)); } catch (e) { } };

const railDot = document.getElementById('railDot');
const railState = document.getElementById('railState');
const consoleTag = document.getElementById('consoleTag');
const startBtn = document.getElementById('startBtn');
const startMeta = document.getElementById('startMeta');
const payloadsBtn = document.getElementById('payloadsBtn');
const plMeta = document.getElementById('plMeta');
const autoBtn = document.getElementById('autoBtn');

const menuItems = [startBtn, payloadsBtn, autoBtn];
let sel = 0;

const panel = document.getElementById('panel'), panelBody = document.getElementById('panel-body');
let panelOpen = false;

function checkFirmwareOnLoad() {
    try {
        if (typeof window.firmware !== 'undefined') {
            const rejectMsg = window.firmware.rejection();
            if (rejectMsg) {
                printLog('SYS_FAIL', 'e', { msg: rejectMsg });
                fwIsValid = false;
            } else {
                printLog('SYS_OK', 'g', { fw: window.fw_str || "UNKNOWN" });
                fwIsValid = true;
            }
        } else {
            printLog('SYS_MISS', 'e');
            fwIsValid = false;
        }

        if (fwIsValid) {
            railDot.classList.add('live');
            railState.textContent = 'JB READY';
            consoleTag.className = 'tag ok';
            consoleTag.textContent = 'READY';
            startBtn.classList.add('ready');
            startBtn.setAttribute('aria-disabled', 'false');
        } else {
            railDot.classList.remove('live');
            railState.textContent = 'JB INCOMPATIBLE';
            consoleTag.className = 'tag err';
            consoleTag.textContent = 'UNSUPPORTED';
            startBtn.classList.remove('ready');
            startBtn.setAttribute('aria-disabled', 'true');
        }
    } catch (e) {
        printLog('ERR_FATAL', 'e', { err: e.message });
    }
}

function syncAutoUI() {
    if (autoBtn) {
        autoBtn.classList.toggle('on', autoload);
        autoBtn.setAttribute('aria-pressed', String(autoload));
        autoBtn.querySelector('.lbl span').textContent = autoload ? 'on boot' : 'disabled';
    }
}

function syncStartMeta() {
    if (!startMeta) return;
    if (!fwIsValid) { startMeta.textContent = 'System incompatible'; return; }
    if (!payloads.length) { startMeta.textContent = 'Waiting for manifest...'; return; }

    const count = activePayloadIndices.length;
    startMeta.textContent = count === 0 ? 'Run Exploit Only'
        : count === 1 ? `Run ${payloads[activePayloadIndices[0]][1]}`
            : `Run ${count} payloads`;
}

window.getSelectedPayloads = () => {
    try { return payloads.length ? activePayloadIndices.map(i => payloads[i]).filter(Boolean) : []; }
    catch (e) { return []; }
};

window.loadOptionalPayloads = async (p, chain, logFn) => {
    try {
        const active = window.getSelectedPayloads();
        if (!active.length) {
            logFn(STRINGS.PL_NONE, "a");
            return;
        }
        logFn(STRINGS.PL_PREP, "i");

        for (let i = 0; i < active.length; i++) {
            const payload = active[i];
            logFn(STRINGS.PL_LOAD.replace('{name}', payload[1]).replace('{file}', payload[3]), "");
            try {
                const elfData = await window.mapElf(payload[3], p, chain);
                logFn(STRINGS.PL_WAIT.replace('{ms}', payload[4] || 3000), "");
                await new Promise(r => setTimeout(r, payload[4] || 3000));
                await window.sendElf(payload[3], elfData, p, chain);
                logFn(STRINGS.PL_SENT.replace('{file}', payload[3]), "g");
            } catch (err) {
                logFn(STRINGS.PL_ERR.replace('{file}', payload[3]).replace('{err}', err), "e");
            }
        }
        logFn(STRINGS.PL_DONE, "g");
    } catch (e) {
        logFn(`Execution Error: ${e.message}`, "e");
    }
};

const runStart = () => {
    try {
        if (busy) return;
        if (!fwIsValid) return printLog('START_INC', 'e');

        if (!payloads.length) printLog('START_NO_MAN', 'a');
        else if (!activePayloadIndices.length) printLog('START_NO_SEL', 'a');

        busy = true;
        if (logEl) logEl.innerHTML = '';

        if (activePayloadIndices.length > 0) printLog('CHAIN_MULTI', 'i', { count: activePayloadIndices.length });
        else printLog('CHAIN_SYS', 'i');

        if (typeof window.runRelapseExploit === "function") {
            window.runRelapseExploit().finally(() => {
                busy = false;
                printLog('DONE_CURSOR', 'g');

                setTimeout(() => {
                    window.history.back();
                    window.history.go(-1);
                    setTimeout(() => { window.location.href = 'about:blank'; }, 500);
                }, 2500);
            });
        } else {
            throw new Error("site.js or exploit chain missing");
        }
    } catch (e) {
        printLog('ERR_FATAL', 'e', { err: e.message });
        busy = false;
    }
};

const getIcon = kind => {
    const p = kind === 'bolt' ? 'M13 3L5 13h5l-1 8 8-11h-5z' : 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg>`;
};

const buildSlots = (list) => {
    try {
        if (!panelBody) return;
        panelBody.innerHTML = list.map((s, k) => {
            const isActive = activePayloadIndices.includes(k) ? ' on' : '';
            return `<div class="slot${isActive}" tabindex="0" role="button" data-k="${k}">
            <div class="slot-ico">${getIcon(s[0])}</div>
            <div class="slot-txt"><div class="n">${s[1]}</div><div class="m">${s[2] || ''}</div></div>
            <span class="toggle" aria-hidden="true"></span></div>`;
        }).join('');
    } catch (e) { }
};

const openPanel = () => {
    try {
        if (!payloads.length) return printLog('MAN_EMPTY', 'e');
        buildSlots(payloads);
        panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); panelOpen = true;
        const first = panelBody.querySelector('.slot'); if (first) first.focus();
    } catch (e) { }
};

const closePanel = () => {
    panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); panelOpen = false;
    menuItems[sel].classList.add('sel');
};

const activateMenu = act => {
    try {
        if (act === 'start') runStart();
        else if (act === 'payloads') openPanel();
        else if (act === 'autoload') {
            autoload = !autoload; saveAuto(autoload); syncAutoUI();
            printLog(autoload ? 'AUTO_EN' : 'AUTO_DIS', '');
        }
    } catch (e) { }
};

const selectMenu = n => {
    sel = (n + menuItems.length) % menuItems.length;
    menuItems.forEach((el, k) => el.classList.toggle('sel', k === sel));
};

try {
    checkFirmwareOnLoad();
    syncAutoUI();
    syncStartMeta();

    fetch('./payloads/payloads.json').then(r => r.json()).then(data => {
        payloads = data;
        activePayloadIndices = activePayloadIndices.filter(idx => idx < payloads.length);
        saveActivePayloads(activePayloadIndices);
        if (plMeta) plMeta.textContent = `${payloads.length} item(s)`;
        syncStartMeta();
        printLog('MAN_OK', '');
    }).catch(() => {
        if (plMeta) plMeta.textContent = 'ERROR';
        if (startMeta) startMeta.textContent = 'No payloads found';
        printLog('MAN_ERR', 'e');
    });

    menuItems.forEach((el, k) => {
        el.addEventListener('click', () => { selectMenu(k); activateMenu(el.dataset.act); });
        el.addEventListener('mouseenter', () => { if (!panelOpen) selectMenu(k); });
    });

    if (panelBody) {
        panelBody.addEventListener('click', (e) => {
            const el = e.target.closest('.slot');
            if (!el) return;
            const k = parseInt(el.dataset.k, 10);
            const idx = activePayloadIndices.indexOf(k);

            if (idx > -1) {
                activePayloadIndices.splice(idx, 1); el.classList.remove('on');
                printLog('PL_DIS', 'a', { name: payloads[k][1] });
            } else {
                activePayloadIndices.push(k); el.classList.add('on');
                printLog('PL_EN', 'g', { name: payloads[k][1] });
            }
            saveActivePayloads(activePayloadIndices); syncStartMeta();
        });
        panelBody.addEventListener('mouseover', (e) => {
            const el = e.target.closest('.slot');
            if (!el) return;
            Array.from(panelBody.querySelectorAll('.slot')).forEach(s => s.classList.remove('sel'));
            el.classList.add('sel');
        });
    }

    document.getElementById('closeBtn')?.addEventListener('click', closePanel);
    document.getElementById('backdrop')?.addEventListener('click', closePanel);

    setTimeout(() => {
        if (autoload) {
            if (fwIsValid) { printLog('AUTO_START', 'a'); setTimeout(runStart, 600); }
            else { printLog('AUTO_CANCEL', 'e'); }
        } else {
            printLog('READY', 'i', {}, true);
        }
    }, 500);

} catch (globalErr) {
    console.error("Init Error:", globalErr);
}