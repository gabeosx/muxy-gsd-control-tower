# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Established `gabeosx/muxy-gsd-control-tower` as the project repository.
- Rewrote the README around the current-project and All projects workflows.
- Replaced synthetic listing artwork with annotated captures of the production panel using disposable GSD data.
- Tightened the marketplace description to the extension's actual read-only scope.

### Changed
- Simplified the panel and documentation around project progress, agent activity, permissions, and limitations.
- Shows factual status signals with predictable project/worktree sorting.
- Added a configurable cross-project planning/Git refresh interval (Manual, 1, 5, 15, or 30 minutes; 5 minutes by default). Agent status remains event-driven.
- Raw GSD status text is display-only; signals use structured agent, verification, checklist/count, handoff, parser, and date data.
- Phase rows now show optional workflow artifacts only when present and expanded; missing stages are never treated as incomplete.
- Progress display now uses roadmap checkboxes or declared phase counts instead of raw percentages.

## [0.1.0] - 2026-08-23

### Added
- Control Tower panel with status signals, project details, search, diagnostics, and preferences.
- Panel opens inside the active project by default and shows milestone progress, next action, planning notes, agent activity, repository context, and source files.
- **Phase evidence view**: phases from `.planning/phases/` and ROADMAP with explicit Current / Planned / Complete / Paused / Verification failed labels; optional artifact chips appear only in expanded rows.
- Breadcrumb navigation with explicit Back affordances on every non-list surface.
- GSD parsers: STATE.md (display-only Blockers/Concerns notes, freshest-timestamp activity), ROADMAP checklist + decimal phases, phase directories, VERIFICATION/HANDOFF/.continue-here/MILESTONES layouts.
- Status-bar signal count + background hub; palette commands and Cmd+Shift+G.

### Fixed
- Fixed a blank project detail view when planning sources were present.
- Blockers/Concerns prose and raw STATE status text never create a status signal; Verification failed requires a typed phase verification result.
- Activity timestamps prefer full ISO last_updated over date-only values; undated evidence no longer resets staleness.
- Next-action and completion displays are derived from structured next actions, phase checklists, and counts instead of status words.

### Changed
- Agent activity now clearly indicates when no session is active in Muxy.

### Security
- Build validation enforces the extension's permission policy.
- Automated release checks cover credentials, private paths, vulnerable dependencies, and reproducible builds.
