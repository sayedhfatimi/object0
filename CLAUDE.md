# object0 — Development Guidelines

object0 is a FOSS desktop S3 bucket manager built with Tauri 2, Vite, React 19,
Tailwind v4, and shadcn/ui (Base UI variant). The UI lives under `src/mainview/`;
the Rust backend under `src-tauri/`.

## Package Manager

Use **`bun`** exclusively. Never run `npm`, `pnpm`, or `yarn`.

```fish
bun install                # install deps
bun add <pkg>              # runtime dep
bun add -d <pkg>           # dev dep
bun run <script>           # run a package.json script
bunx shadcn@latest add <c> # add a shadcn primitive
```

## Quality Checks

Run before every commit:

| Command | What it does |
|---|---|
| `bun run check` | Biome check (lint + format, no fix) |
| `bun run lint` | Biome lint |
| `bun run format` | Biome auto-fix (run instead of fighting Biome) |
| `bun run build` | `tsc && vite build` — typecheck + bundle |
| `cd src-tauri && cargo check` | Rust typecheck |
| `bun run check:all` | check + build + cargo check |

Biome: 2-space indent.

## Commit Convention

**Conventional Commits are required** — the release changelog is generated from
them by `scripts/release/generate-conventional-notes.mjs`. Prefixes:
`feat` (minor), `fix` (patch), `chore`, `refactor`, `docs`, `test`, `perf`,
`ci`, `style`. Breaking changes → major.

### Implementation vs. Bump Commits

Never mix implementation changes with version bumps.

1. Implementation lands as `feat`/`fix`/`refactor`/… commits.
2. A **separate** bump commit touches only the version files:
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
   (+ `bun.lock`). Sync them from the target tag:

   ```fish
   bun run release:sync-version --version vX.Y.Z
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml bun.lock
   git commit -m "chore: bump to X.Y.Z"
   ```

3. Tag the bump commit and push:

   ```fish
   git tag vX.Y.Z
   git push && git push --tags
   ```

**The tag is the source of truth.** CI re-runs `sync-version.mjs` from the tag at
build time, so the bump commit and tag must agree — a mismatch ships the wrong
version.

## Build & Release (GitHub Actions)

Pushing a `v*` tag (`vX.Y.Z` or `vX.Y.Z-rc.N`) triggers
`.github/workflows/release.yml`:

1. Generates release notes from Conventional Commits, creates/updates the GitHub Release.
2. Matrix-builds Tauri bundles: macOS dmg (arm64 + x64), Linux deb/rpm/appimage,
   Windows nsis/msi — plus standalone `--no-bundle` binaries and signed updater JSON.
3. Publishes `object0-bin` to the AUR for non-prerelease tags (no `-` in the tag).

`origin` is SSH, so commits touching `.github/workflows/**` push without the HTTPS
`workflow`-scope limitation.

## Updater Manifest

`bun run updater:manifest` / `bun run updater:verify` maintain the static update feed.

## Conventions

- Failed CI runs and superseded tags stay as historical record — no force-push, no
  tag deletion.
- UI: shadcn/ui primitives under `src/mainview/components/ui/`; add new ones with
  `bunx shadcn@latest add <name>`. Icons: lucide-react. Theming: class-based
  (`.dark` on `<html>`), driven by `useThemeStore`.
