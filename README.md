
<div align="center">SignalGuard

**FM-DX Webserver plugin** - CCI and ACI interference indicators, inspired by [xdr-gtk](https://github.com/kkonradpl/xdr-gtk).

<img width="346" height="148" alt="signalg" src="https://github.com/user-attachments/assets/385cd685-8961-4d97-815b-bf26af09161f" /></div>

### What is it?

SignalGuard adds a visual CCI/ACI interference monitor to the **SIGNAL** panel of [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver). It displays two horizontal progress bars - one for Co-Channel Interference and one for Adjacent Channel Interference - directly above the SIGNAL heading on desktop and below the signal readout on mobile.

The data is read from the tuner's raw signal stream (`sigRaw`) already present in the main WebSocket - no additional connections or server-side processing is required.

**Features:**
- CCI and ACI progress bars side by side, mirroring the xdr-gtk layout
- Peak-hold indicator (8-sample window, ~0.7s) displayed as an overlay label on each bar
- Color coding: red for CCI, orange for ACI; both shift to a darker shade above 50%
- Responsive: different placement on desktop vs. mobile
- Configurable: tooltips and mobile display can be toggled in the source

### Requirements

- [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver) v1.2 or later
- A tuner that reports CCI/ACI values (TEF668x or XDR-F1HD with compatible firmware)

### Compatibility

| Setup | CCI | ACI |
|-------|-----|-----|
| TEF668x headless + [FM-DX-Tuner](https://github.com/kkonradpl/FM-DX-Tuner) | ✅ | ✅ |
| TEF6686 ESP32 ([PE5PVB](https://github.com/PE5PVB/TEF6686_ESP32)) | ✅ | ⚠️ unreliable |
| XDR-F1HD | ✅ | ✅ |

> **Note:** ACI values reported by PE5PVB TEF6686 ESP32 firmware are not reliable and should be treated as indicative only.

### Installation

1. Copy the files into your FM-DX Webserver `plugins/` directory.

2. Restart the webserver, go to **Settings → Plugins** and enable **SignalGuard**.

3. Restart the webserver again.

### Configuration

At the top of `SignalGuard/frontend.js`:

```js
const ENABLE_TOOLTIPS  = true;  // false — disables hover tooltips on desktop
const ENABLE_ON_MOBILE = true;  // false — hides the widget on mobile devices
```
> **Note:** This plugin's code was developed with the assistance of AI.
