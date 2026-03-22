const pluginsApi = require('../server/plugins_api');
const dataHandler = require('../server/datahandler');
const { logInfo } = require('../server/console');

const PEAK_SAMPLES = 8;

function makePeakBuf() {
    return { buf: new Array(PEAK_SAMPLES).fill(-1), pos: 0 };
}

function pushSample(pb, value) {
    pb.pos = (pb.pos + 1) % PEAK_SAMPLES;
    pb.buf[pb.pos] = value;
    let peak = -1;
    for (let i = 0; i < PEAK_SAMPLES; i++) {
        if (pb.buf[i] > peak) peak = pb.buf[i];
    }
    return peak;
}

const peakCci = makePeakBuf();
const peakAci = makePeakBuf();

let pluginsWss = null;
setTimeout(() => { pluginsWss = pluginsApi.getPluginsWss(); }, 0);

function broadcast(cciVal, aciVal, cciPeak, aciPeak) {
    if (!pluginsWss || pluginsWss.clients.size === 0) return;
    const msg = JSON.stringify({ type: 'interference', cci: cciVal, aci: aciVal, cciPeak, aciPeak });
    pluginsWss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try { client.send(msg); } catch (_) {}
        }
    });
}

// Poll dataToSend.sigRaw instead of using Object.defineProperty.
// Avoids: TypeError on redefinition by another plugin, JSON pollution, setter overhead.
let lastSigRaw = '';

setInterval(() => {
    const raw = dataHandler.dataToSend.sigRaw;
    if (!raw || raw === lastSigRaw) return;
    lastSigRaw = raw;

    const comma1 = raw.indexOf(',');
    if (comma1 === -1) return;
    const comma2 = raw.indexOf(',', comma1 + 1);

    const cciParsed = parseInt(raw.slice(comma1 + 1, comma2 === -1 ? undefined : comma2), 10);
    const aciParsed = comma2 === -1 ? NaN : parseInt(raw.slice(comma2 + 1), 10);

    const cciVal = (cciParsed >= 0 && cciParsed <= 100) ? cciParsed : -1;
    const aciVal = (aciParsed >= 0 && aciParsed <= 100) ? aciParsed : -1;

    const cciPeak = pushSample(peakCci, cciVal);
    const aciPeak = pushSample(peakAci, aciVal);

    broadcast(cciVal, aciVal, cciPeak, aciPeak);
}, 80); // ~12 Hz, matching tuner signal rate

logInfo('[SignalGuard] CCI/ACI server plugin loaded.');