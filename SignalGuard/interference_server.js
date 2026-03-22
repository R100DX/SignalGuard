// interference_server.js — SignalGuard
// Ładowany automatycznie przez serwer gdy "interference" jest na liście pluginów.
// Parsuje CCI i ACI z pola sigRaw (dataHandler) i rozsyła je przez pluginsWss.
// Frontend odbiera dane bezpośrednio z głównego window.socket (sigRaw w JSON),
// więc ten plik jest opcjonalny – można go usunąć jeśli pluginsWss nie jest potrzebne.

const pluginsApi = require('../server/plugins_api');
const dataHandler = require('../server/datahandler');
const { logInfo } = require('../server/console');

const PEAK_SAMPLES = 24;

function makePeakBuf() {
    return { buf: new Array(PEAK_SAMPLES).fill(-1), pos: 0 };
}

function pushSample(pb, value) {
    pb.pos = (pb.pos + 1) % PEAK_SAMPLES;
    pb.buf[pb.pos] = value;
    if (value === -1) pb.buf.fill(-1);
    // Prosta pętla zamiast Math.max(...spread) – brak alokacji argumentów
    let peak = -1;
    for (let i = 0; i < PEAK_SAMPLES; i++) {
        if (pb.buf[i] > peak) peak = pb.buf[i];
    }
    return peak;
}

const peakCci = makePeakBuf();
const peakAci = makePeakBuf();

// pluginsWss jest stały po starcie – pobieramy raz zamiast przy każdym broadcastcie
let pluginsWss = null;
setTimeout(() => { pluginsWss = pluginsApi.getPluginsWss(); }, 0);

function broadcast(cciVal, aciVal, cciPeak, aciPeak) {
    if (!pluginsWss || pluginsWss.clients.size === 0) return; // brak klientów = skip JSON.stringify
    const msg = JSON.stringify({ type: 'interference', cci: cciVal, aci: aciVal, cciPeak, aciPeak });
    pluginsWss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try { client.send(msg); } catch (_) {}
        }
    });
}

// Hook na sigRaw przez Object.defineProperty (brak zmian w plikach core)
let lastSigRaw = '';
Object.defineProperty(dataHandler.dataToSend, 'sigRaw', {
    get() { return this._sigRaw; },
    set(raw) {
        this._sigRaw = raw;
        if (!raw || raw === lastSigRaw) return;
        lastSigRaw = raw;

        // indexOf + slice zamiast split() – brak alokacji tablicy
        const comma1 = raw.indexOf(',');
        if (comma1 === -1) return;
        const comma2 = raw.indexOf(',', comma1 + 1);

        const cciRaw = +raw.slice(comma1 + 1, comma2 === -1 ? undefined : comma2) | 0;
        const aciRaw = comma2 === -1 ? -1 : (+raw.slice(comma2 + 1) | 0);

        // Walidacja zakresu raz – wynik używany w pushSample i broadcast
        const cciVal = (cciRaw >= 0 && cciRaw <= 100) ? cciRaw : -1;
        const aciVal = (aciRaw >= 0 && aciRaw <= 100) ? aciRaw : -1;

        const cciPeak = pushSample(peakCci, cciVal);
        const aciPeak = pushSample(peakAci, aciVal);

        broadcast(cciVal, aciVal, cciPeak, aciPeak);
    },
    configurable: true,
    enumerable: true,
});
dataHandler.dataToSend._sigRaw = dataHandler.dataToSend.sigRaw || '';

logInfo('[SignalGuard] CCI/ACI server plugin loaded.');