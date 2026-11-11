// SignalGuard v1.4 https://github.com/R100DX/SignalGuard //

(function () {
    'use strict';

    // #################### CONFIGURATION ####################

    // Tooltips on hover (desktop)
    const ENABLE_TOOLTIPS = true;

    // Show on mobile (max-width: 768px)
    const ENABLE_ON_MOBILE = true;

    // Show BW block
    const ENABLE_BW_BLOCK = true;

    // Animated BW fill; false = static solid fill
    const ENABLE_BW_ANIMATION = true;

    // BW value at 100% fill (236 kHz = widest auto filter)
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

    // Last values, restored after a widget rebuild
    let hasReceivedData = false;
    let lastCci = -1, lastCciPeak = -1;
    let lastAci = -1, lastAciPeak = -1;
    let lastBw  = -1;

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

        .cci-fill      { background: #f97e7e; }
        .cci-fill.high { background: #de4040; }

        .aci-fill      { background: #f9bf7e; }
        .aci-fill.high { background: #de9340; }

        .cci-trough { border-radius: 15px 0 0 0 !important; overflow: hidden; }
        .aci-trough { border-radius: 0 15px 0 0 !important; overflow: hidden; }

        /* BW width: override --bw-block-width */
        .bw-block {
            flex: 0 0 var(--bw-block-width, 85px);
            width: var(--bw-block-width, 85px);
        }

        /* CCI + BW only: equal widths */
        .bw-block.bw-grow {
            flex: 1;
            width: auto;
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

        /* Outer corners on first/last visible block */
        @media only screen and (min-width: 769px) {
            .cci-aci-trough.edge-left  { border-top-left-radius: 15px !important; }
            .cci-aci-trough.edge-right { border-top-right-radius: 15px !important; }
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

    let mountedIsMobile = null;

    function mount() {
        const isMobile = window.innerWidth <= 768;
        const existing = document.getElementById('cci-aci-container');

        if (existing) {
            if (isMobile === mountedIsMobile) return true;
            existing.remove();
        }

        const signalHighest = document.getElementById('data-signal-highest');
        if (!signalHighest) return false;

        const panel = signalHighest.closest('.panel-33');
        if (!panel) return false;

        if (!ENABLE_ON_MOBILE && isMobile) {
            mountedIsMobile = isMobile;
            return true;
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

        restoreLastState();

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

    // Remount on mobile/desktop breakpoint change
    let resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(mount, 150);
    });

    const HIGH = 50;

    function refreshEdgeRounding() {
        const container = document.getElementById('cci-aci-container');
        if (!container) return;

        const visibleBlocks = Array.from(container.children).filter(function (el) {
            return el.style.display !== 'none';
        });

        container.querySelectorAll('.cci-aci-trough').forEach(function (trough) {
            trough.classList.remove('edge-left', 'edge-right');
        });

        if (visibleBlocks.length === 0) return;

        const firstTrough = visibleBlocks[0].querySelector('.cci-aci-trough');
        const lastTrough  = visibleBlocks[visibleBlocks.length - 1].querySelector('.cci-aci-trough');

        if (firstTrough) firstTrough.classList.add('edge-left');
        if (lastTrough)  lastTrough.classList.add('edge-right');

        // CCI is always visible, so 2 visible incl. BW = CCI + BW
        const bwBlock = container.querySelector('.bw-block');
        if (bwBlock) {
            const bwVisible = visibleBlocks.indexOf(bwBlock) !== -1;
            bwBlock.classList.toggle('bw-grow', bwVisible && visibleBlocks.length === 2);
        }
    }

    function restoreLastState() {
        if (!hasReceivedData) return;

        updateBar('cci-fill', 'cci-label', 'CCI', lastCci, lastCciPeak, false);
        updateBar('aci-fill', 'aci-label', 'ACI', lastAci, lastAciPeak, true);
        if (ENABLE_BW_BLOCK) updateBw(lastBw);
    }

    function updateBar(fillId, labelId, prefix, cur, peak, hideOnNoData) {
        const fill  = document.getElementById(fillId);
        const label = document.getElementById(labelId);
        if (!fill || !label) return;
        const block = fill.parentElement.parentElement; // fill -> trough -> block

        if (cur < 0) {
            fill.style.width = '0%';
            fill.classList.remove('high');
            label.textContent = prefix + ': ?';
            label.classList.add('unknown');
            if (hideOnNoData && block) block.style.display = 'none';
        } else {
            fill.style.width = (cur > 100 ? 100 : cur) + '%';
            fill.classList.toggle('high', cur >= HIGH);
            label.textContent = prefix + ': ' + (peak >= 0 ? peak + '%' : '?');
            label.classList.remove('unknown');
            if (hideOnNoData && block) block.style.display = '';
        }

        if (hideOnNoData) refreshEdgeRounding();
    }

    function updateBw(bwVal) {
        const fill  = document.getElementById('bw-fill');
        const label = document.getElementById('bw-label');
        if (!fill || !label) return;
        const block = fill.parentElement.parentElement; // fill -> trough -> block

        if (bwVal < 0) {
            fill.style.width = '0%';
            label.textContent = 'BW: ?';
            label.classList.add('unknown');
            if (block) block.style.display = 'none';
            refreshEdgeRounding();
            return;
        }

        if (ENABLE_BW_ANIMATION) {
            const pct = Math.max(0, Math.min(100, (bwVal / MAX_BW_KHZ) * 100));
            fill.style.width = pct + '%';
        } else {
            fill.style.width = '100%';
        }

        label.textContent = 'BW: ' + bwVal + ' kHz';
        label.classList.remove('unknown');
        if (block) block.style.display = '';
        refreshEdgeRounding();
    }

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
            lastAci = -1; lastAciPeak = -1; lastBw = -1;
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

        const cciPeak = pushSample(peakCci, cci);
        const aciPeak = pushSample(peakAci, aci);
        updateBar('cci-fill', 'cci-label', 'CCI', cci, cciPeak, false);
        updateBar('aci-fill', 'aci-label', 'ACI', aci, aciPeak, true);

        hasReceivedData = true;
        lastCci = cci; lastCciPeak = cciPeak;
        lastAci = aci; lastAciPeak = aciPeak;

        // BW: 4th field
        if (ENABLE_BW_BLOCK) {
            const comma3 = comma2 === -1 ? -1 : sigRaw.indexOf(',', comma2 + 1);
            const bwParsed = comma3 === -1 ? NaN : parseInt(sigRaw.slice(comma3 + 1), 10);
            const bw = (bwParsed >= 0) ? bwParsed : -1;
            updateBw(bw);
            lastBw = bw;
        }
    }

    // Reattach if window.socket is replaced (reconnect)
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