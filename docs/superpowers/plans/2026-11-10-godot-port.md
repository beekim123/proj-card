# H5 → Godot 4.7.2 implementation plan

> **For agentic workers:** Use subagent-driven-development; review each deliverable against the frozen H5 and final verification. No commits or pushes.

**Goal:** Reproduce the current H5 game in native typed GDScript, preserving rules, assets, timings, text and interaction.

**Architecture:** JSON-compatible dictionaries retain source field names, while function names use snake_case. Pure rule modules are independent of the engine scene tree, storage, time and global randomness. Native UI consumes their outputs; sprite nodes consume exported timelines and a shared feel clock.

**Tech stack:** Local Godot 4.7.2, Compatibility, typed GDScript, Node 24 tooling, Chrome offline asset/audio capture.

**Spec:** `/Users/key_/Desktop/CURRGO/game/design/新卡牌/Godot移植/需求.md`, plus user decisions in this chat.

## Global constraints

- In-place migration; preserve every original H5 file and uncommitted change in `h5/`, then treat it as read-only.
- Do not commit, push, install plugins, Android SDK or JDK.
- At most 2 resource-intensive tasks and 2 computing workers across this machine; root schedules local compute conservatively as one worker.
- Graphical Godot windows must use the freshly identified built-in Mac display.
- Current H5 is the exact oracle. Historical references retain original statistical criteria.
- Golden traces retain both the original encodeRunSave result and complete raw state, including practice and terminal states.
- Windows templates: official 4.7.2 release only, verify official checksum, add only missing Windows files to the standard user template directory.

## Task 1 — Frozen reference and oracle

- [x] Move all original entries except Godot.app, art-source, .git, .gitignore into h5.
- [x] Hash frozen reference files; run H5 through an external Vite cache so sources remain unchanged.
- [x] Create Node TS import resolver and deterministic action dispatcher in tools/golden.
- [x] Generate at least 300 complete adventure traces plus practice variants, RNG samples and named rule test cases.
- [x] Exercise native red/green regressions and replay every recorded JSON field with first-path diagnostics; the final frozen-source validation is recorded in artifacts/test-report.json.

## Task 2 — Pure native rules

Files: rules/types.gd, config.gd, effects.gd, index.gd, run_config.gd, run.gd, save_state.gd.

Interfaces: Dictionary states retain camelCase source keys; RulesCore static functions reproduce index.ts; RulesRun static functions reproduce run.ts; RulesSave handles version 4 envelopes. JS undefined is represented by absence, and JSON omits absent fields.

- [x] Port unsigned 32-bit Mulberry32, JS rounding, stable sorting and all core transitions.
- [x] Port hooks, adventure phases, debug commands, strict save validation and formatting.
- [x] Port all 377 current rule cases with matching names; retain H5 assertions and expand parameterized cases.
- [x] Replay golden traces and fix mismatches without changing H5.

## Task 3 — Art and sound pipeline

Files: tools/export-sprites/, tools/import-sprites.*, scripts/art/, audio/, fonts/.

- [x] Adapt original exporter paths only, preserve all sampling parameters, run with one Chrome renderer and owned-process cleanup.
- [x] Re-export every asset, compare timings, frames and slot matrices; verify fingerprints.
- [x] Generate native resources and explicit VRAM/lossless import policies.
- [x] Implement create/play/stay/slots/tint/static/effect/nine-slice APIs and clock-driven playback.
- [x] Record all H5 synthesized sounds with Chrome OfflineAudioContext; retain gain settings and event timings.
- [x] Add licensed Source Han Sans SC or Noto Sans CJK SC and notices.
- [x] Exercise all assets in native inspector and automated node tests.

## Task 4 — Native game and persistence

Files: project.godot, scenes/main.tscn, scripts/app/, scripts/ui/, tools/run.sh, 启动.command.

- [x] Copy both layout tables and fit/hand geometry; test no overlap or clipping.
- [x] Implement home, practice, relic, battle, loot, doors, shop, result, modals, settings, records and full debug controls.
- [x] Implement arrange/rewind/strike/draw, damage preview, feel clock, input cancellation and keyboard/touch parity.
- [x] Save/restore active battle and reward phases; handle invalid/old saves as H5 does.
- [x] Resolve built-in display from fresh metadata and Godot DisplayServer coordinates before displaying the game.

## Task 5 — Verification, exports and handoff

Files: tools/check.sh, tools/screens.*, tests/, export_presets.cfg, HANDOFF.md, ASSET-NOTICES.md, docs/v2/status.md.

- [x] Run all native tests and H5 baseline with bounded workers; emit 全部通过 only if every mandatory check passes.
- [x] Capture paired H5/native screenshots for every requested scene in both orientations.
- [x] Verify official Windows archive checksum and extract missing Windows files only; configure three platforms, export macOS and Windows.
- [x] Inspect macOS export startup on built-in display; record Windows runtime verification limits.
- [x] Complete feature checklist, test parity counts, golden counts, H5 differences/bugs, Android prerequisites and unfinished work honestly.
- [x] Review implementation independently, verify reference fingerprints, clean owned processes and record next actor/status.

## Delivery result

Final complete check: 4866 passed, 0 failed. Golden 312 traces/37575 steps and historical 400 runs/60223 commands match. Final 64 paired screenshots and platform packages are delivered; macOS LaunchServices startup is verified. Windows OS runtime and user acceptance remain explicitly unclaimed. See HANDOFF.md and docs/v2/status.md for next actor and evidence. No commit or push.
