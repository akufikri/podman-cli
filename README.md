```
▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄  ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄       ▄▄▄▄▄▄▄ ▄▄▄     ▄▄▄▄▄▄▄
███ ███ ███ ███ ███ ███ ██ █ ██ ███ ███ ███ ███      ███ ███ ███       ███  
███▄███ ███ ███ ███ ███ ██ ▀ ██ ███▄███ ███ ███      ███     ███ ▄▄▄   ███  
███     ███▄███ ███▄███ ███ ███ ███ ███ ███ ███      ███▄███ ███▄███ ▄▄███▄▄
▀▀▀     ▀▀▀▀▀▀▀ ▀▀▀▀▀▀  ▀▀▀ ▀▀▀ ▀▀▀ ▀▀▀ ▀▀▀ ▀▀▀      ▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀
```

# podman-cli

A TUI dashboard for managing Podman, built with [OpenTUI](https://opentui.com/) (`@opentui/core`) on top of Bun.

[![Bun](https://img.shields.io/badge/runtime-Bun%201.4-000000?logo=bun&logoColor=white)](https://bun.com)
[![OpenTUI](https://img.shields.io/badge/TUI-OpenTUI-7fd6ff)](https://opentui.com/)
[![Podman](https://img.shields.io/badge/podman-%E2%89%A5%204-892CA0?logo=podman&logoColor=white)](https://podman.io)
[![Platform](https://img.shields.io/badge/platform-macOS%20(arm64)-lightgrey)](#1-requirements)

Status: **working & verified** (list, create, start/stop/restart, logs, pull, remove — all tested against real Podman).

## Table of contents

1. [Requirements](#1-requirements)
2. [Install & run](#2-install--run)
3. [Layout](#3-layout)
4. [Keys & mouse](#4-keys--mouse)
5. [Responsive](#5-responsive)
6. [Actions per section](#6-actions-per-section)
7. [Logging](#7-logging)
8. [Structure & commands](#8-structure--commands)
9. [Troubleshooting](#9-troubleshooting)
10. [Development notes](#10-development-notes)
11. [Not done yet](#11-not-done-yet-further-ideas)
12. [Related projects](#12-related-projects-in-mylab)

---

## 1. Requirements

- `podman` on PATH (tested with podman **6.0.1**, machine `podman-machine-default`, applehv/libkrun provider)
- `bun` — **requires 1.4.x** (see [Troubleshooting](#9-troubleshooting))
- The Podman machine must be running. If it is down, the TUI shows a warning and an `m` key to start it.

## 2. Install & run

```bash
git clone https://github.com/akufikri/podman-cli.git
cd podman-cli
bun install
bun start                 # or: bun src/index.ts
```

As a global command:

```bash
bun link                  # once only
podman-cli                # from any directory
```

## 3. Layout

```
 podman-cli   machine: running   |   4 containers (2 up)  ·  13 images  ·  2 pods  ·  4 volumes  ·  3 networks
┌─ Menu ───────────────┐ ┌───────────────────────────────────────────────────────────────┐
│ RESOURCES            │ │  ▶ ● xampp-db               docker.io/library/mariadb:11      │
│ ▶ Containers       4 │ │    3306->3306/tcp   [pod pod_podman-xampp]                    │
│   Images          13 │ │    ● xampp-pma              docker.io/library/phpmyadmin:latest│
│   Pods             2 │ │    8888->80/tcp   [pod pod_podman-xampp]                      │
│   Volumes          4 │ │    ○ autoclip-redis         docker.io/library/redis:7-alpine  │
│   Networks         3 │ │    6379->6379/tcp                                             │
│ ──────────────────── │ │    ○ xampp-app              localhost/xampp-app-custom:latest │
│ TOOLS                │ │                                                               │
│   New container      │ │                                                               │
│   Logs               │ │                                                               │
│   Help               │ │                                                               │
└──────────────────────┘ └───────────────────────────────────────────────────────────────┘
                         ┌─ Details ─────────────────────────────────────────────────────┐
                         │ name    xampp-db                                              │
                         │ image   docker.io/library/mariadb:11                          │
                         │ state   running   Up 37 minutes                               │
                         │ ports   3306->3306/tcp                                        │
                         │ pod     pod_podman-xampp     id 054e648e3a19                  │
                         └───────────────────────────────────────────────────────────────┘
 ↑↓ move (menu/list) · Enter open · Esc back to menu · ←→ switch section · r refresh · q quit
```

- **Menu** (left) — two groups: **RESOURCES** (Containers, Images, Pods, Volumes, Networks + item count) and **TOOLS** (New container, Logs, Help). The active row is marked with `▶` and highlighted when the menu zone is active; it can be **clicked with the mouse** (hover also highlights); the menu auto-scrolls when the terminal is short.
- **List** (middle) — items in the active section.
- **Details** (bottom) — info about the selected item.
- **Popup** — action list, `y/n` confirmation, logs, or input (pull image).

## 4. Keys & mouse

There are **two zones**: `menu` (left) and `list` (middle). The border of the active panel **lights up** (accent) while the inactive one is **dimmed** — so it is always clear where you are and which keys apply.

| Key | Function |
| --- | --- |
| `↑` `↓` (or `j` `k`) | move in the active zone |
| `Enter` | in the **menu**: enter that section (the zone moves to the list if the section has a list) · in the **list**: open the action menu for the selected item |
| `Esc` | from the list back to the menu · from **Help**/**Logs**/**New container** back to the last data section |
| `Tab` | switch zone (menu ⇄ list); in the New container form: next field |
| `←` `→` (or `h` `l`) | change **data** section directly: Containers → Images → Pods → Volumes → Networks (wraps around) |
| `1`–`5` | jump straight to a data section |
| `6` / `7` / `8` | New container / Logs / Help |
| `r` | refresh data (in Logs: reload the log file) |
| `m` | start the Podman machine (appears when the machine is down) |
| `q` / `ctrl+c` | quit |

**Mouse** (OpenTUI enables mouse mode; no modifier key needed):

| Action | Function |
| --- | --- |
| left click on a menu row (left) | switch to that section — same as selecting + `Enter` |
| hover a menu row | the row is highlighted (soft highlight color, separate from the `▶` highlight of the active zone) |
| scroll wheel over the menu/list/log | scroll that panel (keyboard fallback: `↑↓`, `PgUp`/`PgDn`) |

`←`/`→` deliberately **do not** enter New container/Logs/Help so the arrows inside the form stay dedicated to moving the text. Enter them through the menu (`Enter`, clickable) or `6`/`7`/`8`.

Example flow: `↓↓` in the menu → `Enter` (enter the Pods section) → `↓` in the list → `Enter` (open the actions).

### New container

- `↑↓` / `Tab` / `Shift+Tab` — next field
- `Enter` — run `podman run -d`
- `Esc` — back to the list
- `j`/`k` are **not** intercepted here so they can still be typed as text
- After a successful create: the form is cleared and it automatically returns to the **Containers** list

Fields: `image`, `name`, `ports` (`8080:80, 8443:443`), `volumes` (`/host:/container`), `env` (`KEY=VALUE`), `restart`, `command`. List separator: comma or newline.

## 5. Responsive

The layout adapts to the terminal size (including small split panes):

| Condition | Behavior |
| --- | --- |
| rows < 20 | the **Details** panel is hidden |
| rows < 16 | item descriptions are hidden (1 row per item) |
| rows < 15 | menu group headers + separators are hidden (the 7 menu rows still fit) |
| cols < 62 | the sidebar uses short labels; the status bar & help are trimmed by 1 row |
| always | popups are clamped so they never exceed the screen; the Help menu scrolls inside its panel |
| resize | the layout is recomputed through the renderer's `resize` event |

All bars (top status, message, help) are forced onto **one row** and truncated with `…` — they never wrap, because wrapping once made the list height 0 so the list looked empty.

## 6. Actions per section

| Section | Actions |
| --- | --- |
| **Containers** | Start · Stop · Restart · Logs · Remove |
| **Images** | Run container from image (fills the form) · Pull/update image · Remove |
| **Pods** | Start · Stop · Remove |
| **Volumes** | Remove |
| **Networks** | Remove |

All remove actions always ask for `y/n` confirmation first. Logs appear in a scrollable popup (`Esc` closes it).

## 7. Logging

All activity is written to a single file (append):

```
${XDG_STATE_HOME:-~/.local/state}/podman-cli/podman-cli.log
```

Format: one line per event — `YYYY-MM-DD HH:MM:SS level message [scope]`

```
2026-09-28 09:14:59 info  start · log /Users/me/.local/state/podman-cli/podman-cli.log [app]
2026-09-28 09:14:59 info  podman machine inspect --format {{.State}} → 0 (210ms) [podman]
2026-09-28 09:15:00 info  podman ps -a --format json → 0 (747ms) [podman]
2026-09-28 09:15:04 info  podman stop 054e648e3a19 → 0 (512ms) [podman]
2026-09-28 09:15:09 error podman rm -f 054e648e3a19 → 125 (188ms): Error: container is running [podman]
2026-09-28 09:15:09 error remove xampp-db: Error: container is running [ui]
```

- `[podman]` — every `podman` invocation (argv, exit code, duration). stderr is only logged when the exit code ≠ 0, trimmed to one row + at most 400 characters.
- `[ui]` — failed UI actions (action label + error message).
- `[app]` — start/quit and the container/image/pod/volume/network count summary after a refresh.

To view it inside the TUI: left menu → **TOOLS → Logs** (or press `7`), which shows the last 500 rows in a scrollable panel; `r` reloads the file. A failed log write never brings down the TUI (it is `catch`ed).

## 8. Structure & commands

```
podman-cli/
├── src/
│   ├── podman.ts     # typed podman CLI wrapper (array args — no shell string)
│   ├── log.ts        # file logger + reader for the Logs menu
│   └── index.ts      # OpenTUI UI
├── package.json
├── tsconfig.json
└── README.md
```

`src/podman.ts` can be used standalone (without the TUI):

```bash
bun src/podman.ts containers
bun src/podman.ts images
bun src/podman.ts pods
bun src/podman.ts volumes
bun src/podman.ts networks
bun src/podman.ts machine
```

npm/bun scripts: `start`, `typecheck`, `containers`, `images`, `pods`, `volumes`, `networks`, `machine`.

## 9. Troubleshooting

**`Failed to initialize OpenTUI render library: Unknown type buffer`**

The wrong Bun version is in use. On this machine `~/.bun/bin/bun` = **1.0.30** (old) and `/opt/homebrew/bin/bun` = **1.4.2**. OpenTUI fails on 1.0.30 because its FFI rejects the native lib.

- The `src/index.ts` shebang is already **pinned** to `#!/opt/homebrew/bin/bun`. Do not change it to `/usr/bin/env bun` — the PATH order can pick the old bun.
- `~/.zshrc` appends `$HOME/.bun/bin` to the **end** of PATH (never the front), backup at `~/.zshrc.bak-podman-cli`.
- `~/.bun/bin` is not on PATH in non-interactive shells — use an absolute path when scripting.

**The list looks empty** — usually the terminal is too short/narrow. Reduce the font zoom or enlarge the window; the layout will adapt (see the Responsive section).

**`podman-cli` not found** — run `bun link` again, or call `bun src/index.ts`.

## 10. Development notes

Summary of the work on this project:

**Built**

- Typed Podman wrapper (`src/podman.ts`): containers, images, pods, volumes, networks, logs, pull, run, start/stop/restart/rm, machine status/start.
- TUI dashboard: sidebar menu, item list, Details panel, action/confirmation/logs/input popups, status bar, help bar, Help menu.
- Sidebar grouped into RESOURCES/TOOLS + item counts, per-row hover & **mouse click**, auto-scroll.
- **Logging** to `~/.local/state/podman-cli/podman-cli.log` (every podman command + exit code/duration, UI errors, start/quit) + a **Logs** menu to read it in the TUI.
- Volumes & Networks sections (plus Remove actions).
- Global install through `bun link` + shebang + `chmod +x`.
- Responsive layout + re-layout on resize.

**Bugs found & fixed**

1. **`y/n` confirmation did not work** — `openConfirm` set `pendingConfirm` before `openOverlay()`, while `openOverlay()` calls `closeOverlay()`, which nulls that flag. Fix: set it after the overlay is opened.
2. **Navigation kept following the menu** — OpenTUI focus routing cannot be relied on (the menu still received arrows even after `blur()` + `focus()`). Fix: navigation is handled manually in the `renderer.keyInput` handler with `stopPropagation()`.
3. **Arrows moved the menu on boot** — `focusZone` was initialized to `"menu"` while `switchView("containers")` during boot early-returned. Fix: consistent initialization + a final zone model.
4. **Success messages were overwritten** — `refresh(quiet)` overwrote the success message with the loading placeholder. Fix: save & restore the message.
5. **Empty list in a narrow terminal** (the root cause of `Enter` appearing to do nothing) — the status bar wrapped to 3 rows and the help bar to 2 rows, plus Details had a fixed height of 8 → list height 0. Fix: force 1 row + hide Details/descriptions according to size.
6. **The New container form felt stuck** — every key returned early so `↑↓` did nothing. Fix: `↑↓` moves to the next field + a hint inside the panel + auto-return to the list after success.
7. **OpenTUI failed to start** — an old bun (1.0.30) on PATH. Fix: pinned shebang + fixed PATH order.
8. **The left menu had no groups and did not follow focus** — `SelectRenderable` does not support headers/separators, so New container & Help were mixed in with the resource list; the highlight stayed even when the zone moved to the list. Fix: the sidebar is built from its own `BoxRenderable` rows (RESOURCES/TOOLS groups, right-aligned item counts, highlight following the zone, auto-scroll via `ScrollBoxRenderable`).
9. **The `←/→` arrows could get stuck in the form** — they used to cycle through all 7 sections including New container, while the arrows in the form are used to move the text. Fix: `←/→` only cycle through the 5 data sections; `6`/`7` for New container/Help.
10. **`Esc` did not work in Help/the form** — Help has no list so the "list" zone got stuck, and the form always returned to Containers. Fix: `Esc` from Help/the form returns to the last data section.
11. **Help text overlapped other panels** — a long `TextRenderable` without clipping bled past the panel bounds as far as the message row. Fix: Help is wrapped in a `ScrollBoxRenderable` + rows were shortened.
12. **Keys were ignored during boot** — `renderer.start()` was only called after `await refresh()`, so input during the loading state was lost. Fix: start the renderer first, data follows.
13. **The sidebar had the wrong width after a resize** — `renderMenu()` read back `sidebar.width` (the Yoga value is only filled in after the layout pass), so after shrinking and then enlarging the terminal the labels stayed truncated. Fix: the inner width is computed from the terminal size (`menuInner`) and the layout is applied twice per resize.

**How it was verified**

- `bunx tsc --noEmit` is clean (strict).
- Functional tests against real Podman used a throwaway container (`busybox`), then removed it. Evidence was taken from **Podman state**, not from the UI text.
- For the display: the TUI was run inside **tmux** and the screen was captured with `tmux capture-pane -p` (including `-e` to inspect the highlight/zone colors). The Python ANSI emulator (`pyte`) is **no longer** used — OpenTUI sends frame diffs and pyte left old frame remnants so the screen looked "ghosted".

## 11. Not done yet (further ideas)

- `podman compose up/down` actions
- Item search/filter (`/`)
- Full container inspect, exec into a container
- Prune (unused images/volumes/networks)
- Sort/filter the list (e.g. only the running ones)

## 12. Related projects in `~/mylab`

- **downloads-organizer** — tidies up `~/Downloads` automatically (launchd `WatchPaths` + weekly, non-destructive, unknown types are filed under `Other/<ext>/`).
