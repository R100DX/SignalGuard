(function () {
    'use strict';

    // #################### KONFIGURACJA ####################

    // Wyłącz tooltip po najechaniu kursorem (desktop)
    const ENABLE_TOOLTIPS = true;

    // Wyłącz wyświetlanie UI na telefonach (max-width: 768px)
    const ENABLE_ON_MOBILE = true;

    // ######################################################

    // ── Peak-hold ring buffer ──────────────────────────
    const PEAK_SAMPLES = 8;

    function makePeakBuf() {
        return { buf: new Array(PEAK_SAMPLES).fill(-1), pos: 0 };
    }

    function pushSample(pb, value) {
        pb.pos = (pb.pos + 1) % PEAK_SAMPLES;
        pb.buf[pb.pos] = value;
        if (value === -1) pb.buf.fill(-1);
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
            border-radius: 1px;
            transition: width 0.15s linear;
        }

        .cci-fill      { background: #f97e7e; }
        .cci-fill.high { background: #de4040; }

        .aci-fill      { background: #f9bf7e; }
        .aci-fill.high { background: #de9340; }

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

        h2.signal-heading {
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
        }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ── HTML widgetu ──────────────────────────────────────────────────────────
    function buildBlock(fillClass, fillId, labelId, labelText, tooltipText) {
        return [
            '<div class="cci-aci-block">',
              '<div class="cci-aci-trough">',
                '<div class="cci-aci-fill ' + fillClass + '" id="' + fillId + '"></div>',
              '</div>',
              '<span class="cci-aci-label unknown" id="' + labelId + '">' + labelText + '</span>',
              (ENABLE_TOOLTIPS ? '<span class="cci-aci-tooltip">' + tooltipText + '</span>' : ''),
            '</div>'
        ].join('');
    }

    function buildWidget() {
        const wrap = document.createElement('div');
        wrap.id = 'cci-aci-container';
        wrap.innerHTML =
            buildBlock('cci-fill', 'cci-fill', 'cci-label', 'CCI: ?', 'Co-Channel Interference') +
            buildBlock('aci-fill', 'aci-fill', 'aci-label', 'ACI: ?', 'Adjacent Channel Interference');
        return wrap;
    }

    // ── Mount ─────────────────────────────────────────────────────────────────
    function mount() {
        if (document.getElementById('cci-aci-container')) return true;

        const signalHighest = document.getElementById('data-signal-highest');
        if (!signalHighest) return false;

        const panel = signalHighest.closest('.panel-33');
        if (!panel) return false;

        const isMobile = window.innerWidth <= 768;

        if (!ENABLE_ON_MOBILE && isMobile) return true; // wyłączone na mobile – nie montuj

        if (isMobile) {
            const textBig = panel.querySelector('.text-big');
            if (!textBig) return false;
            textBig.insertAdjacentElement('afterend', buildWidget());
        } else {
            const heading = panel.querySelector('h2.signal-heading');
            if (!heading) return false;
            heading.insertAdjacentElement('beforebegin', buildWidget());
        }

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

    // ── Aktualizacja UI ───────────────────────────────────────────────────────
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

    // ── Parsowanie sigRaw z głównego window.socket ────────────────────────────
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
    }

    function attachSocket() {
        if (window.socket && window.socket.addEventListener) {
            window.socket.addEventListener('message', onMessage);
            return;
        }
        setTimeout(attachSocket, 200);
    }
    attachSocket();

})();