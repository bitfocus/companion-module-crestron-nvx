# Crestron DM NVX

Direct routing control for Crestron DM NVX encoders and decoders using the CresNext REST API.

## Setup

Choose **System matrix** mode to scan a subnet and control multiple endpoints from one Companion instance. Choose **Single endpoint** mode to target one DM NVX endpoint directly.

For secured endpoints, use **Auto** or **HTTPS login** authentication and enter the device username and password. Leave **Allow self-signed HTTPS certificates** enabled unless the endpoints have trusted certificates installed.

System mode checks **Known endpoints** first when that field is populated. This is the best option for Wi-Fi or routed networks. Enter IPs separated by commas, spaces, or new lines.

If **Known endpoints** is empty, system mode scans the configured CIDR subnet on startup when **Discover on startup** is enabled. Use the **Discover endpoints** action after changing the endpoint network or adding devices.

Example known endpoint list:

```text
192.168.14.226, 192.168.14.105, 192.168.15.223
```

## Routing

Source presets route the configured active destination. By default, a source button routes video, audio, and USB together. Breakaway actions are available for video-only, audio-only, USB-only, and video+audio routing.

Only endpoints currently reporting `DeviceSpecific.DeviceMode` as `Receiver` appear as destinations. Only endpoints currently reporting `DeviceSpecific.DeviceMode` as `Transmitter` contribute source presets.

The module uses `/Device/AvRouting` and route index `0` for the first version. It sets `VideoSource`, `AudioSource`, and `UsbSource` UUIDs reported by DM NVX discovered streams, subscriptions, and local transmit streams.

## Encoder Inputs

The module discovers local inputs from `/Device/AudioVideoInputOutput` and maps them to the valid `DeviceSpecific.VideoSource` values `Input1`, `Input2`, and so on.

Use the **Set encoder input** or **Set endpoint video source / input** action to switch a transmitter's local input separately from routing. A Companion button can contain both:

1. **Route source using default mode** to route the encoder to the active decoder.
2. **Set encoder input** to choose which local input that encoder transmits.

Generated input presets are available in the **Z Input Select (STREAM/HDMI/USBC)** category. They include feedback when that input is selected and are labelled as inputs, for example **STREAM**, **HDMI1**, **HDMI2**, **USBC1**, and so on.

## Decoder Video Sources

Decoders can also use `DeviceSpecific.VideoSource`. The module exposes decoder video source choices as:

- **STREAM** writes `Stream` and shows the routed network stream.
- **HDMI1**, **HDMI2**, and other discovered local inputs write `Input1`, `Input2`, and so on.

Only endpoints currently reporting `DeviceSpecific.DeviceMode` as `Receiver` appear in these choices. Generated buttons are available in the **Z Input Select (STREAM/HDMI/USBC)** preset category and include feedback for the currently selected source.

This means a decoder button can either route an encoder stream and leave the destination on **STREAM**, or switch the destination display to a local HDMI input without changing the routing subscription.

After changing an endpoint between encoder and decoder mode, run **Discover endpoints** or **Refresh status** so Companion rebuilds the source, destination, and input lists for the new mode.

## Admin Actions

The **Admin - ENC/DEC Mode Select** preset category includes **Set Encoder** and **Set Decoder** buttons for discovered endpoints. These write `Device.DeviceSpecific.DeviceMode`. On tested DM-NVX-350 firmware, Crestron accepts the write and reports `reboot needed`.

The action list also includes admin actions for:

- setting endpoint hostname through `Device.DeviceInfo.Name`
- setting primary transmit bitrate through `Device.StreamTransmit.Streams[0].Bitrate`
- setting USB mode through `Device.Usb.UsbPorts[0].Mode`

USB mode labels are intentionally explicit:

- **DEVICE (COMPUTER)** writes Crestron USB mode `Local`. Use this where the computer is connected.
- **HOST (USB PERIPHERAL)** writes Crestron USB mode `Remote`. Use this where USB peripherals are connected.

## Source Labels

Use **Source aliases** to override source names:

```text
00000000-0000-4002-0054-018a0089fd1c=Lectern PC
DM-NVX-E30-DEADBEEF1234=Rack Player
192.168.1.45=Camera Encoder
```

## Current Scope

This build focuses on direct endpoint discovery, source routing, decoder source selection, endpoint input selection, breakaway AV/USB control, status variables, feedbacks, and commissioning raw GET/POST actions.
