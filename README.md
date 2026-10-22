# N1 TV for Samsung Tizen

A minimal Samsung TV web app for Tizen 5.5 and newer. The home screen has **Gledaj uživo** and **N1 TV**. The latter is intentionally inactive. Live TV offers N1 Bosnia and Herzegovina, Croatia, and Serbia.

The interface starts in light mode, with a white background and a blue spinner only while video connects. The moon/sun button in the upper right switches between light and dark mode and remembers the choice. The video screen is clear during playback; OK or the remote Play/Pause key pauses and resumes it.

The logo asset is downloaded from [N1's own website](https://n1info.ba/media/original_images/n1.max-800x600.original.original.svg) and kept locally as `n1-logo.svg` so the TV interface does not depend on the logo host at runtime.

## Publish the channel file

The app loads its channel list and stream URLs **only from GitHub**. `channels.json` in this repository is the source file to publish. It is excluded from the `.wgt` package.

The source is [`channels.json`](https://github.com/edoedac0/N1-App/blob/main/channels.json) in this repository. `settings.js` already points to its raw URL. The app fetches the file once at startup, then opens the cached three-channel list instantly. GitHub edits appear on the next app launch without rebuilding. The pre-existing `stream.txt` is retained untouched for the legacy app.

For a repository, the URL has this form:

```text
https://raw.githubusercontent.com/edoedac0/N1-App/main/channels.json
```

If the repository ever moves, update the URL in `settings.js`, then rebuild and reinstall the app.

If the file cannot be reached, the app shows an error on the channel list. There is no bundled channel fallback.

## Build and install

Open this folder as a Tizen TV web application in Tizen Studio, or use the included CLI script:

```sh
./build.sh YOUR_CERTIFICATE_PROFILE
```

The signed package is `dist/N1 TV.wgt`. A Samsung TV certificate profile configured for your device is required to install it. The script copies only the TV app files to a staging directory, leaving `channels.json` and the browser-only hls.js library out of the package. The minimum Tizen version is set to 5.5 in `config.xml`.

## Remote control

| Key | Action |
| --- | --- |
| Arrows and OK | Select a menu item or channel |
| Red key | Open the channel list |
| 1, 2, 3 | Open Bosnia and Herzegovina, Croatia, Serbia after channels have loaded |
| Left / down while playing | Previous channel |
| Right / up while playing | Next channel |
| Channel − / + while playing | Previous / next channel |
| Previous / next track | Previous / next channel |
| OK or Play/Pause while playing | Pause or resume |
| Pause / Play keys | Pause / resume |
| Back | Player → channels → home; exits from home |
| OK on a playback error | Retry the stream |

The app uses Samsung AVPlay for HLS on TV and requests the highest available quality at startup. Browsers with native HLS use it directly; other browsers use a local copy of [hls.js 1.7.3](https://github.com/video-dev/hls.js/releases/tag/v1.7.3), loaded only when needed. The browser player also starts at the highest listed variant, then adapts if the connection cannot sustain it. Its forward and back buffers are limited to 20 seconds. The library's MIT license is in `vendor/hls-LICENSE`.

The three channel buttons are created once when the startup fetch finishes and reused as the remote focus moves. Leaving playback releases the decoder and buffers; putting the app in the background closes the stream and returns to the channel list. The video overlay is a single centered button, with no full-screen wrapper. Layout uses CSS supported by Tizen 5.5's Chromium 69 engine rather than newer `inset` and flexbox `gap` shortcuts.

## Stream sources

The three URLs in `channels.json` point to United Cloud HLS endpoints. The Bosnia and Croatia endpoints appear in N1's own live page source. The Serbia endpoint appears on the official [N1/Nova diaspora page](https://n1nova.live/n1-uzivo.html). On 22 October 2026, all three returned HLS master and media playlists plus MPEG-TS video segments during a network check. N1's Serbia live page itself currently displays a stream unavailable message, so actual playback can depend on location or changes at the source. The app displays a retry message when a stream fails.

### Picture quality

The highest variant published by each of these three public feeds is **720×576 at 25 fps and about 1.5 Mb/s**. A sampled segment was progressive H.264 with a 16:9 display aspect ratio (anamorphic pixels). The other variants are 480×384, 360×288, and 240×192. The player now begins with the top variant on AVPlay and hls.js, while leaving adaptive switching available for weak connections. It preserves the 16:9 picture with letterboxing instead of cropping or stretching it.

The N1/Nova diaspora site uses the same Serbia feed. Candidate higher-bitrate United Cloud endpoint names returned HTTP 403 in a direct check; no accessible HD replacement was verified. Display scaling, CSS filters, and upconverting cannot recover detail absent from the source. If N1 publishes an accessible HD HLS master in the future, replacing the URL in GitHub `channels.json` is sufficient; no app rebuild is needed.

Sources: [N1 Bosnia live](https://n1info.ba/n1-tv-live-stream/), [N1 Croatia live](https://n1info.hr/n1-tv-live-stream/), [N1/Nova diaspora live](https://n1nova.live/n1-uzivo.html), [N1 Serbia live](https://n1info.rs/n1-tv-live-stream/), [Samsung adaptive streaming guide](https://developer.samsung.com/smarttv/develop/guides/multimedia/adaptive-streaming.html), [Samsung AVPlay guide](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html), [Samsung remote guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html).
