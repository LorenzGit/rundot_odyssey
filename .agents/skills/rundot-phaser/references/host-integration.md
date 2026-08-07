# Host integration checklist

- Register lifecycle listeners once, outside scene recreation. Forward pause/resume to the active Phaser game.
- Fetch safe area and profile after SDK import settles; treat failures as optional enhancements.
- Use a facade to expose `loadProgress`, `saveProgress`, `track`, `haptic`, `showRewardedAd`, `submitScore`, and other game-specific operations.
- Debounce storage writes and flush on meaningful checkpoints, pause, and quit.
- Never block initial rendering on optional network APIs. Hide the native preloader after essential local assets are ready.
- Use `RundotGameAPI.cdn.fetchAsset()` for deployed CDN assets, queue the resulting blob URL in Phaser, start the loader, and revoke the URL on completion/error.
- Keep authoritative economy and multiplayer mutations on the relevant platform/server APIs. Local Phaser state is a prediction or presentation layer.
- Display a small non-modal status for unavailable platform features in desktop browser development.
