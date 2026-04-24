# CAH QBank macOS Developer ID DMG Release Plan

Date: 2026-04-24
Status: Superseded by `docs/superpowers/plans/2026-04-24-apple-platform-release-packaging-plan.md`

> This Mac-only Developer ID DMG plan was revised after deciding that iPhone support is a near-term goal. Use the superseding Apple-platform release packaging plan instead of implementing this document directly.

## Current State

- The native macOS app is a real Xcode project at `native/macos/CAHQBankMac/CAHQBankMac.xcodeproj`.
- The app target is `CAHQBankMac`, with tests in `CAHQBankMacTests`.
- A Debug `.app` builds successfully through Xcode.
- A Release archive can be produced locally and contains a universal `x86_64` plus `arm64` app binary.
- The archived app is currently signed only as `Sign to Run Locally` / ad hoc, with no TeamIdentifier.
- Hardened Runtime is currently off in Release build settings.
- Gatekeeper rejects the current archived app.
- No `.dmg`, `.pkg`, `ExportOptions.plist`, notarization artifact, Developer ID signing configuration, or notary profile is committed in the repo.
- The repo currently exposes only an `Apple Development` signing identity on this machine, not a `Developer ID Application` identity.
- The AppIcon asset catalog exists, but it currently has no committed icon image files.

## Goal

Build a direct-distribution macOS release path for `CAH QBank.app`: Developer ID signed, hardened runtime enabled, notarized, stapled, and packaged as a versioned DMG.

Do not implement this yet. This document preserves the agreed plan so packaging work can resume later from a clean handoff point.

## Distribution Track

- Target direct distribution via Developer ID DMG.
- Do not target Mac App Store export in this pass.
- Keep the existing macOS 26.0 deployment target for the first release.
- Keep the app binary universal for Apple Silicon and Intel.
- Follow Apple Developer ID notarization requirements:
  - Developer ID Application certificate.
  - Hardened Runtime.
  - Valid code signature with secure timestamp.
  - `notarytool` submission.
  - Stapled notarization ticket.

References:

- Apple notarization docs: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Developer ID certificates: https://developer.apple.com/help/account/create-certificates/create-developer-id-certificates/

## Planned Implementation

- Work in a separate branch/worktree, for example `codex/macos-developer-id-dmg`.
- Keep the current Debug target/module/scheme name `CAHQBankMac` so existing dev scripts keep working.
- Keep normal Debug output as `CAHQBankMac.app`.
- Use `CAH QBank` as the user-facing display name.
- Stage the Release app as `CAH QBank.app` only in the release output folder before creating the DMG.
- Update the XcodeGen-backed native macOS project config:
  - Enable Hardened Runtime for Release.
  - Disable injected debug/base entitlements for distribution.
  - Add `LSApplicationCategoryType = public.app-category.education`.
  - Preserve the existing bundle identifier unless a later release task explicitly changes it.
- Add a simple repo-owned CAH app icon:
  - Generate all required macOS AppIcon PNG sizes.
  - Commit the generated icon images.
  - Add a small regeneration script using built-in macOS/Swift tooling only.
- Add a release script under `native/macos/CAHQBankMac/scripts/release.sh`:
  - Preflight Xcode tools, XcodeGen, Developer ID identity, and notary profile.
  - Archive Release.
  - Validate signing and hardened runtime.
  - Notarize and staple the app.
  - Create a DMG containing `CAH QBank.app` and an `/Applications` shortcut.
  - Sign, notarize, staple, and verify the DMG.
  - Write artifacts under ignored `native/macos/CAHQBankMac/build/release/`.
- Add release documentation under `native/macos/CAHQBankMac/docs/` or an equivalent local docs path:
  - Required Apple Developer account role and certificate.
  - How to create/store the `notarytool` keychain profile.
  - How to run the release script.
  - How to interpret common preflight failures.

## Release Interface

Planned script:

```sh
native/macos/CAHQBankMac/scripts/release.sh
```

Expected environment:

- `DEVELOPER_ID_APPLICATION`: optional explicit signing identity. If unset, the script should auto-detect exactly one `Developer ID Application:` identity and fail if none or multiple are found.
- `NOTARYTOOL_PROFILE`: optional keychain profile name. Default should be `CAH_QBANK_NOTARY`.

Expected final artifact:

```text
native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg
```

Credential handling:

- Do not store Apple IDs, app-specific passwords, API keys, private keys, or certificates in the repo.
- If credentials are missing, fail with precise setup instructions.
- Do not claim that a distributable release was produced unless signing, notarization, stapling, and Gatekeeper validation all pass.

## Verification Plan

Run native build and tests:

```sh
AGENT_NAME=CODEX make -C native/macos/CAHQBankMac agent-verify
```

Verify release artifacts:

```sh
codesign --verify --strict --verbose=2 "native/macos/CAHQBankMac/build/release/CAH QBank.app"
codesign -dvvv --entitlements :- "native/macos/CAHQBankMac/build/release/CAH QBank.app"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH QBank.app"
spctl -a -vv "native/macos/CAHQBankMac/build/release/CAH QBank.app"
hdiutil verify "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
spctl -a -vv -t open "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
```

Before merge:

- Request code review on the finished implementation branch.
- Evaluate review feedback technically before changing code.
- Fix Critical and Important findings before final handoff.

## Out of Scope

- Do not implement App Store signing/export in this pass.
- Do not lower the macOS deployment target in this pass.
- Do not add third-party release dependencies unless a later plan explicitly approves them.
- Do not stage or preserve unrelated nested worktree changes under `.claude/worktrees/blissful-curran-af5382`.
