# Third-party notices

The template's direct runtime dependencies are distributed under the following
licenses, as declared by the installed packages audited on 2026-07-24:

| Package | Reviewed version | License |
| --- | --- | --- |
| `@series-inc/rundot-game-sdk` | 5.24.0 | MIT |
| `firebase` | 12.16.0 | Apache-2.0 |
| `pixi.js` | 8.19.0 | MIT |
| `react` | 19.2.4 | MIT |
| `react-dom` | 19.2.4 | MIT |
| `three` | 0.185.1 | MIT |

The lockfile also resolves transitive and development dependencies. Their
license texts ship in their npm packages and remain controlling. Re-run a
dependency-license review whenever the lockfile changes, preserve required
copyright and attribution notices, and include applicable notices with any
distributed compiled build. This file does not replace those license texts.

## Development and QA tooling

| Package | Reviewed version | License |
| --- | --- | --- |
| `@playwright/test` | 1.62.0 | Apache-2.0 |

Playwright is used only for local and CI browser verification and is not
included in the compiled game bundle.

## Vendored authoring tools

| Project | Reviewed version | Upstream revision | License |
| --- | --- | --- | --- |
| [`hoainho/img2threejs`](https://github.com/hoainho/img2threejs) | 1.3.0 | `7b1c62ccf34957ac5d68b7863718af9eab777c7e` | [Apache-2.0](.agents/skills/img2threejs/LICENSE) |

`img2threejs` is project-local authoring tooling and is not shipped in the
compiled game bundle. Its functional skill instructions, supporting
documentation, quality rubrics, pipeline scripts, and tests are vendored under
`.agents/skills/img2threejs/`; showcase media and upstream repository-management
files are intentionally excluded. Its included license remains controlling for
the vendored materials.

The repository's own materials are governed by [LICENSE.md](LICENSE.md).
