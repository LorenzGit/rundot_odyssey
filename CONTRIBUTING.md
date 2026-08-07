# Contributing

Thank you for improving `rundot_template`, the RUN renderer and platform
reference. Keep contributions small, reviewable, and safe for downstream game
creators.

## Before opening a pull request

1. Use Node.js 22 or newer and install the locked dependency graph with
   `npm ci`.
2. Keep paid, privileged, destructive, permission-prompting, and remote-write
   additional features inert until an explicit player or operator action.
3. Never simulate a successful purchase, ad reward, entitlement, score grant,
   privileged operation, or billed generation result.
4. Preserve local fallback behavior, capability checks, bounded SDK calls,
   lifecycle cleanup, relative asset paths, and fail-closed platform IDs.
5. Run `npm run format`, then `npm run check:all`.
6. Update documentation and the visible package version when behavior changes.

Do not commit credentials, environment files, RUN session data, player data,
campaign state, generated QA output, or third-party material without compatible
license and attribution.

Contributions are governed by [LICENSE.md](LICENSE.md), including its
contribution terms. Before submitting, contributors must accept the current
Contributor License Agreement or Developer Certificate of Origin offered by
the hosting platform. Clearly describe material changes and preserve all
license and attribution notices.
