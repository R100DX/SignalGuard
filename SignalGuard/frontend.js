// SignalGuard v1.3 https://github.com/R100DX/SignalGuard //

(function () {
    'use strict';

    // #################### CONFIGURATION ####################

    // Disable tooltip on hover (desktop)
    const ENABLE_TOOLTIPS = true;

    // Disable UI display on mobile devices (max-width: 768px)
    const ENABLE_ON_MOBILE = true;

    // Show/hide the BW block entirely
    const ENABLE_BW_BLOCK = true;

    // Animate the BW fill width (like CCI/ACI) or show a static solid background
    const ENABLE_BW_ANIMATION = true;

    // Auto-BW ceiling used to scale the BW fill bar (0-100%).
    // 236 kHz = widest Lithio *auto* filter step; 311 kHz is manual-only.
    const MAX_BW_KHZ = 236;

    // ######################################################

    const PEAK_SAMPLES = 8;

    function makePeakBuf() {
        return { buf: new Array(PEAK_SAMPLES).fill(-1), pos: 0 };
    }

    function pushSample(pb, value) {
        pb.pos = (pb.pos + 1) % PEAK_SAMPLES;
        pb.buf[pb.pos] = value;
        let peak = -1;
        for (let i = 0; i < pb.buf.length; i++) {
            if (pb.buf[i] > peak) peak = pb.buf[i];
        }
        return peak;
    }

    const peakCci = makePeakBuf();
    const peakAci = makePeakBuf();

    // ── CSS ───────────────────────────────────────────────────────────────────
    const css = `
        #cci-aci-container {
            display: flex;
            flex-direction: row;
            gap: 4px;
            margin-bottom: 4px;
        }

        .cci-aci-block {
            flex: 1;
            position: relative;
            height: 16px;
        }

        .cci-aci-trough {
            width: 100%;
            height: 100%;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 2px;
            overflow: hidden;
            box-sizing: border-box;
        }

        .cci-aci-fill {
            height: 100%;
            width: 0%;
            transition: width 0.15s linear;
        }

        /* CCI: rounded top-left corner (outer container corner) */
        .cci-fill      { background: #f97e7e; }
        .cci-fill.high { background: #de4040; }

        /* ACI: rounded top-right corner – fill grows from left,
           so top-right is only visible when fill = 100%,
           therefore we round the trough instead of the fill */
        .aci-fill      { background: #f9bf7e; }
        .aci-fill.high { background: #de9340; }

        .cci-trough { border-radius: 15px 0 0 0 !important; overflow: hidden; }
        .aci-trough { border-radius: 0 15px 0 0 !important; overflow: hidden; }

        /* BW block: fixed/overridable width, not flex:1 like CCI/ACI.
           Override --bw-block-width in your own CSS to resize it. */
        .bw-block {
            flex: 0 0 var(--bw-block-width, 85px);
            width: var(--bw-block-width, 85px);
        }

        .bw-fill { background: rgb(47 110 76); }
        .bw-fill.no-anim { transition: none !important; }

        .cci-aci-label {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 99%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 500;
            font-family: "Roboto Mono", monospace;
            letter-spacing: 0.02em;
            color: var(--color-text);
            text-shadow: 0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6);
            pointer-events: none;
            white-space: nowrap;
        }

        .cci-aci-label.unknown {
            color: var(--color-2);
            font-weight: normal;
        }

        #freq-container + div h2.signal-heading {
            font-size: 20px;
            margin-top: -2px;
        }

        /* Tooltip */
        .cci-aci-tooltip {
            position: absolute;
            bottom: calc(100% + 6px);
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.85);
            color: #fff;
            font-size: 11px;
            font-family: inherit;
            white-space: nowrap;
            padding: 4px 8px;
            border-radius: 4px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 100;
        }

        .cci-aci-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 4px solid transparent;
            border-top-color: rgba(0,0,0,0.85);
        }

        .cci-aci-block:hover .cci-aci-tooltip {
            opacity: 1;
        }

        @media only screen and (max-width: 768px) {
            #cci-aci-container {
                margin-bottom: 0;
                margin-top: 6px;
            }
            .cci-aci-tooltip {
                display: none;
            }
            .cci-trough,
            .aci-trough {
                border-radius: 2px !important;
            }
        }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ── Widget HTML ──────────────────────────────────────────────────────────
    function buildBlock(fillClass, fillId, labelId, labelText, tooltipText, troughClass) {
        return [
            '<div class="cci-aci-block">',
              '<div class="cci-aci-trough' + (troughClass ? ' ' + troughClass : '') + '">',
                '<div class="cci-aci-fill ' + fillClass + '" id="' + fillId + '"></div>',
              '</div>',
              '<span class="cci-aci-label unknown" id="' + labelId + '">' + labelText + '</span>',
              (ENABLE_TOOLTIPS ? '<span class="cci-aci-tooltip">' + tooltipText + '</span>' : ''),
            '</div>'
        ].join('');
    }

    // BW block: same fill mechanism as CCI/ACI, own class for width + color
    function buildBwBlock() {
        return [
            '<div class="cci-aci-block bw-block">',
              '<div class="cci-aci-trough bw-trough">',
                '<div class="cci-aci-fill bw-fill' + (ENABLE_BW_ANIMATION ? '' : ' no-anim') + '" id="bw-fill"></div>',
              '</div>',
              '<span class="cci-aci-label unknown" id="bw-label">BW: ?</span>',
              (ENABLE_TOOLTIPS ? '<span class="cci-aci-tooltip">IF Bandwidth</span>' : ''),
            '</div>'
        ].join('');
    }

    function buildWidget() {
        const wrap = document.createElement('div');
        wrap.id = 'cci-aci-container';
        wrap.innerHTML =
            buildBlock('cci-fill', 'cci-fill', 'cci-label', 'CCI: ?', 'Co-Channel Interference', 'cci-trough') +
            (ENABLE_BW_BLOCK ? buildBwBlock() : '') +
            buildBlock('aci-fill', 'aci-fill', 'aci-label', 'ACI: ?', 'Adjacent Channel Interference', 'aci-trough');
        return wrap;
    }

    // ── Mount ─────────────────────────────────────────────────────────────────
    // Tracks which layout (mobile/desktop) the widget was last mounted for,
    // so a viewport change (resize, device rotation, devtools toggle) can
    // trigger a remount instead of leaving the widget stuck in the old spot.
    let mountedIsMobile = null;

    function mount() {
        const isMobile = window.innerWidth <= 768;
        const existing = document.getElementById('cci-aci-container');

        if (existing) {
            if (isMobile === mountedIsMobile) return true; // already correctly placed
            existing.remove(); // viewport crossed the breakpoint - reposition below
        }

        const signalHighest = document.getElementById('data-signal-highest');
        if (!signalHighest) return false;

        const panel = signalHighest.closest('.panel-33');
        if (!panel) return false;

        if (!ENABLE_ON_MOBILE && isMobile) {
            mountedIsMobile = isMobile;
            return true; // disabled on mobile – do not mount
        }

        if (isMobile) {
            const textBig = panel.querySelector('.text-big');
            if (!textBig) return false;
            textBig.insertAdjacentElement('afterend', buildWidget());
        } else {
            const heading = panel.querySelector('h2.signal-heading');
            if (!heading) return false;
            heading.insertAdjacentElement('beforebegin', buildWidget());
        }

        mountedIsMobile = isMobile;
        return true;
    }

    function tryMount() {
        if (mount()) return;
        const obs = new MutationObserver(function () {
            if (mount()) obs.disconnect();
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryMount);
    } else {
        tryMount();
    }

    // Re-evaluate placement whenever the viewport crosses the mobile/desktop
    // breakpoint (window resize, orientation change, devtools device toggle).
    let resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(mount, 150);
    });

    // ── UI Update ───────────────────────────────────────────────────────
    const HIGH = 50;

    function updateBar(fillId, labelId, prefix, cur, peak) {
        const fill  = document.getElementById(fillId);
        const label = document.getElementById(labelId);
        if (!fill || !label) return;

        if (cur < 0) {
            fill.style.width = '0%';
            fill.classList.remove('high');
            label.textContent = prefix + ': ?';
            label.classList.add('unknown');
        } else {
            fill.style.width = (cur > 100 ? 100 : cur) + '%';
            fill.classList.toggle('high', cur >= HIGH);
            label.textContent = prefix + ': ' + (peak >= 0 ? peak + '%' : '?');
            label.classList.remove('unknown');
        }
    }

    // ── BW update: same shape as updateBar(), own scaling constant ─────────
    function updateBw(bwVal) {
        const fill  = document.getElementById('bw-fill');
        const label = document.getElementById('bw-label');
        if (!fill || !label) return;

        if (bwVal < 0) {
            fill.style.width = '0%';
            label.textContent = 'BW: ?';
            label.classList.add('unknown');
            return;
        }

        if (ENABLE_BW_ANIMATION) {
            const pct = Math.max(0, Math.min(100, (bwVal / MAX_BW_KHZ) * 100));
            fill.style.width = pct + '%';
        } else {
            // Static mode: no proportional bar, just a solid filled block.
            fill.style.width = '100%';
        }

        label.textContent = 'BW: ' + bwVal + ' kHz';
        label.classList.remove('unknown');
    }

    // ── Parsing sigRaw from main window.socket ────────────────────────────
    let lastFreq = null;

    function onMessage(event) {
        let data;
        try { data = JSON.parse(event.data); } catch (_) { return; }

        const freq   = data.freq;
        const sigRaw = data.sigRaw;

        if (freq && freq !== lastFreq) {
            lastFreq = freq;
            peakCci.buf.fill(-1);
            peakAci.buf.fill(-1);
            if (ENABLE_BW_BLOCK) updateBw(-1);
        }

        if (!sigRaw) return;

        const comma1 = sigRaw.indexOf(',');
        if (comma1 === -1) return;

        const comma2 = sigRaw.indexOf(',', comma1 + 1);

        const cciParsed = parseInt(sigRaw.slice(comma1 + 1, comma2 === -1 ? undefined : comma2), 10);
        const aciParsed = comma2 === -1 ? NaN : parseInt(sigRaw.slice(comma2 + 1), 10);

        const cci = (cciParsed >= 0 && cciParsed <= 100) ? cciParsed : -1;
        const aci = (aciParsed >= 0 && aciParsed <= 100) ? aciParsed : -1;

        updateBar('cci-fill', 'cci-label', 'CCI', cci, pushSample(peakCci, cci));
        updateBar('aci-fill', 'aci-label', 'ACI', aci, pushSample(peakAci, aci));

        // BW: independent 3rd comma, does not affect cci/aci parsing above in any way
        if (ENABLE_BW_BLOCK) {
            const comma3 = comma2 === -1 ? -1 : sigRaw.indexOf(',', comma2 + 1);
            const bwParsed = comma3 === -1 ? NaN : parseInt(sigRaw.slice(comma3 + 1), 10);
            const bw = (bwParsed >= 0) ? bwParsed : -1;
            updateBw(bw);
        }
    }

    // Store reference to the socket instance we attached to.
    // If window.socket is replaced with a new object (reconnect), we reattach.
    let attachedSocket = null;

    function attachSocket() {
        if (window.socket && window.socket !== attachedSocket) {
            if (attachedSocket) {
                attachedSocket.removeEventListener('message', onMessage);
            }
            window.socket.addEventListener('message', onMessage);
            attachedSocket = window.socket;
        }
        setTimeout(attachSocket, 1000);
    }
    attachSocket();

})();
