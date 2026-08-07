# MP3 playback, looping, and asset delivery

Choose delivery deliberately. Confirm the target build tool before copying an
example and keep the audio service responsible for cleanup and settings.

## Core bundled music or SFX

For small, always-available core assets, put the MP3 under the game source tree
and let the bundler fingerprint it. In Vite/TypeScript projects:

```ts
import themeUrl from './assets/audio/theme.mp3'

const music = new Audio(themeUrl)
music.loop = true
music.preload = 'auto'
music.volume = 0.45

// Call from an explicit player gesture or after the audio service is unlocked.
await music.play()

// On pause/background or scene teardown:
music.pause()
music.currentTime = 0
```

Do not construct this in every scene. One audio service should own the instance,
apply persisted music/SFX settings, bound retries, and resume/restart behavior.
Never assume `play()` succeeds; it can reject until the WebView permits audio.

## CDN-delivered or entitlement-protected audio

Place larger or optional assets under `public/cdn-assets/audio/`, for example:

```text
public/cdn-assets/audio/event-theme.mp3
```

After deploy, load a playable blob URL with the SDK:

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api'

const url = await RundotGameAPI.cdn.loadAsset('audio/event-theme.mp3', {
  type: 'audio',
  timeout: 60_000,
})
const music = new Audio(url)
music.loop = true
await music.play()

// Tear-down: clean cached blob URLs when the audio/scene is no longer needed.
RundotGameAPI.cdn.cleanupAssets()
```

`loadAsset` returns a blob URL for audio. It downloads the full asset, so keep
files and concurrent tracks modest. Use `cdn.config.json` only when audio is
actually entitlement-gated; configure the product/entitlement first and handle
`ENTITLEMENT_REQUIRED` honestly rather than exposing a broken play button.

## Loop and mix checklist

- Author/export a seamless loop; test its actual loop point on device.
- Start music only after a deliberate player gesture when required.
- Keep one owner per music bus, fade transitions, and stop/fade on lifecycle
  pause/background. Do not stack duplicate loops on menu re-entry.
- Separate persisted Music, SFX, and Voice/Ambience settings; mute immediately.
- Audit loudness on phone speaker and headphones, repeated SFX under rapid tap,
  slow network/asset timeout, reload, pause/resume, and unavailable-host paths.
