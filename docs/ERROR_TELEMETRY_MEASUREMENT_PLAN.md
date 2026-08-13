# Loading and renderer error measurement

- Decision and owner: Odyssey creator decides whether to roll back or patch boot/renderer failures.
- Primary metric: affected players / `load_started` players by exact build; target below 1% after 100 players.
- Guardrails: menu boot time, `load_assets_ready` conversion, successful WebGL fallback, no sensitive payloads.
- Events: `critical_asset_timeout`, `critical_asset_retry`, `critical_asset_failure`, `renderer_backend_fallback`, `renderer_fallback_exhausted`, `renderer_initialization`, `renderer_load_stalled`, `react_render_boundary`, and `boot_failure`.
- Properties: bounded error name/message/stack, structured SDK code/status/detail, source basename, line/column, asset ID, attempt, elapsed/timeout milliseconds, boot stage, backend, and component stack. RUN stamps the authoritative game version and platform context.
- Prohibited data: player IDs, URLs/query strings, storage values, purchase data, and player-authored text.
- Source limits: current creator exports count events but do not expose payload dimensions; Venus needs the separate detailed-error export handoff.
- QA: exercise asset retry/failure and both renderer fallbacks locally, then confirm payloads in a real RUN host after release.
