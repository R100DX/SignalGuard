
<div align="center">
  
**FM-DX Webserver plugin** - CCI, ACI and BW interference indicators, inspired by [xdr-gtk](https://github.com/kkonradpl/xdr-gtk).

<img width="352" height="144" alt="cciacibw" src="https://github.com/user-attachments/assets/57f0cdb5-135c-47b1-9299-cf51dea4f7b7" /></div>

### What is it?

SignalGuard adds a visual CCI/ACI/BW monitor to the **SIGNAL** panel of [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver). It displays three horizontal indicators - Co-Channel Interference, real-time IF Bandwidth, and Adjacent Channel Interference directly above the SIGNAL heading on desktop and below the signal readout on mobile.

**Features:**
- CCI, BW and ACI indicators side by side
- Color coding: red for CCI, orange for ACI and green for BW
- Responsive: different placement on desktop vs. mobile
- Configurable: tooltips and mobile display can be toggled in the source

### Requirements

- [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver) v1.4 or later
- A tuner that reports CCI/ACI/BW values (TEF668x or XDR-F1HD with compatible firmware)

### Compatibility

| Setup | CCI | ACI | BW |
|-------|-----|-----|-----|
| TEF668x headless + latest [FM-DX-Tuner](https://github.com/kkonradpl/FM-DX-Tuner) | ✅ | ✅ | ✅ (patch req.) |
| TEF668x ESP32 ([PE5PVB](https://github.com/PE5PVB/TEF6686_ESP32)) | ✅ | ⚠️ unreliable | ✅ |
| XDR-F1HD | ✅ | ✅ | ⚠️ untested |

### How to enable BW reporting in firmware [FM-DX-Tuner](https://github.com/kkonradpl/FM-DX-Tuner)

If the BW block shows BW: ?, your firmware isn't reporting real-time bandwidth yet. Here's how to fix it:

**1. Open the file: ``src/Controllers/Tuner/TEF668X/TEF668X.cpp``**

**2. Find this function**
```js
int16_t
TEF668X::getQualityBandwidth(QualityMode mode)
{
    /* TODO */
    return -1;
}
```
**3. Replace it with:**
```js
int16_t
TEF668X::getQualityBandwidth(QualityMode mode)
{
    if (!this->bw.isAvailable())
    {
        return -1;
    }

    return this->bw.getLast();
}
```

> **Note:** ACI values reported by PE5PVB TEF6686 ESP32 firmware are not reliable and should be treated as indicative only.

### Installation

1. Copy the files into your FM-DX Webserver `plugins/` directory.

2. Restart the webserver, go to **Settings -> Plugins** and enable **SignalGuard**.

3. Restart the webserver again.

### Configuration

At the top of `SignalGuard/frontend.js`:

```js
const ENABLE_TOOLTIPS     = true;  // false — disables hover tooltips on desktop
const ENABLE_ON_MOBILE    = true;  // false — hides the widget on mobile devices
const ENABLE_BW_BLOCK     = true;  // false — hides the BW block entirely
const ENABLE_BW_ANIMATION = true;  // false — BW fill snaps instantly instead of animating
const MAX_BW_KHZ          = 236;   // scaling ceiling for the BW fill bar (kHz)
```
> **Note:** This plugin's code was developed with the assistance of AI.
