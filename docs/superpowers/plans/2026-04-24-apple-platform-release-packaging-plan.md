# Apple Platform Release Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare CAH QBank for both Mac and iPhone by first separating shared Apple-platform code from Mac-only behavior, then shipping a polished Mac Developer ID DMG, and finally adding the iPhone app/distribution track.

**Architecture:** Do not harden the current Mac app into a Mac-only release before isolating reusable code. Create a shared SwiftUI/data foundation that can support both macOS and iOS, keep platform-specific shells thin, and treat Mac Developer ID notarization and iPhone/TestFlight packaging as separate release outputs.

**Tech Stack:** SwiftUI, XcodeGen, Xcode, SQLite, macOS Developer ID signing/notarization, iOS simulator/device signing, existing `native/macos/CAHQBankMac` project.

---

## References

- Apple recommends shared multiplatform targets when existing and new platform apps overlap substantially, especially SwiftUI apps, while isolating platform-specific APIs with conditional code or platform-specific files: https://developer.apple.com/documentation/xcode/configuring-a-multiplatform-app-target
- Apple notes that each platform still has its own build, archive, and submission process, so Mac Developer ID packaging and iPhone TestFlight/App Store packaging remain separate release tracks: https://developer.apple.com/documentation/xcode/configuring-a-multiplatform-app-target
- Apple notarization requirements for Mac direct distribution: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution

## Current State To Preserve

- Root repo: `/Users/anirudhbalachandar/Projects/cah-qbank`.
- Native Mac project: `native/macos/CAHQBankMac`.
- Current Mac target/scheme: `CAHQBankMac`.
- Existing Mac code builds as a native SwiftUI/Xcode `.app`.
- Existing Mac data flow is local-repo based:
  - `Sources/Data/RepoConfiguration.swift` resolves a local repo root containing `questions/`, `app/`, and `native/`.
  - `Sources/App/CAHQBankMacApp.swift` and `Sources/Views/RootView.swift` import AppKit and use Mac-only repo chooser/Finder/pasteboard APIs.
  - `Sources/Services/QBankService.swift`, model types, SQLite layer, and most service logic are candidates for shared code once repo access is abstracted.
- Existing Mac release state:
  - Release archive can build.
  - Current Release signing is ad hoc / `Sign to Run Locally`.
  - Hardened Runtime is off.
  - Gatekeeper rejects the archive.
  - No DMG/notarization automation exists yet.
- Existing dirty state to avoid staging unless explicitly instructed:
  - `.claude/worktrees/blissful-curran-af5382`.

## Strategy

Use a three-phase plan:

1. **Shared Apple-platform foundation first.** This prevents Mac packaging work from locking in assumptions that make iPhone support harder.
2. **Mac Developer ID DMG second.** Once the shared/platform split exists, make the Mac app polished, signed, notarized, stapled, and packaged.
3. **iPhone app/distribution third.** Add iPhone-specific shell, content strategy, device/simulator verification, and TestFlight/App Store packaging after the shared foundation is proven.

Do not attempt to fully finish Mac and iPhone release packaging in one single pass. The two platforms should share core logic but have separate release workflows and acceptance gates.

## File Structure Decisions

These are target end-state paths; implementation may adjust exact XcodeGen syntax after checking generated project output.

- Modify: `native/macos/CAHQBankMac/project.yml`
  - Add shared source grouping and iOS target/scheme.
  - Keep existing Mac target/scheme stable unless a later task explicitly renames it.
- Create: `native/macos/CAHQBankMac/Sources/Shared/`
  - Shared models, service protocols, SQLite/data access, question parsing, practice/session logic.
- Create: `native/macos/CAHQBankMac/Sources/Mac/`
  - Mac app entrypoint, repo locator adapter, AppKit-only chooser/Finder/pasteboard views.
- Create: `native/macos/CAHQBankMac/Sources/iOS/`
  - iPhone app entrypoint, mobile shell/navigation, iOS content store adapter.
- Create: `native/macos/CAHQBankMac/Tests/SharedTests/`
  - Cross-platform data/service tests.
- Create: `native/macos/CAHQBankMac/Tests/MacTests/`
  - Mac repo-link and Mac adapter tests.
- Create: `native/macos/CAHQBankMac/Tests/iOSTests/`
  - iOS store/bootstrap tests.
- Create: `native/macos/CAHQBankMac/scripts/release-mac.sh`
  - Mac Developer ID archive/sign/notarize/staple/DMG workflow.
- Create: `native/macos/CAHQBankMac/scripts/preflight-apple-release.sh`
  - Shared preflight for Xcode, signing identities, and notary profile.
- Create: `native/macos/CAHQBankMac/docs/release.md`
  - Human release instructions for Mac and iPhone.

## Phase 1: Shared Apple-Platform Foundation

### Task 1: Baseline Verification

**Files:**
- Read: `native/macos/CAHQBankMac/project.yml`
- Read: `native/macos/CAHQBankMac/Sources/**`
- Read: `native/macos/CAHQBankMac/Tests/**`

- [ ] **Step 1: Confirm root status**

Run:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
git status -sb
```

Expected:

- Root may still show `.claude/worktrees/blissful-curran-af5382` as dirty.
- Do not stage that path.

- [ ] **Step 2: Confirm current native Mac baseline**

Run:

```bash
AGENT_NAME=CODEX make -C native/macos/CAHQBankMac agent-verify
```

Expected:

- Current Mac build and tests pass before refactoring.

- [ ] **Step 3: Commit nothing**

This task is verification only.

### Task 2: Separate Shared Logic From Mac-Only Logic

**Files:**
- Modify: `native/macos/CAHQBankMac/Sources/App/CAHQBankMacApp.swift`
- Modify: `native/macos/CAHQBankMac/Sources/Views/RootView.swift`
- Move/refactor: `native/macos/CAHQBankMac/Sources/Data/**`
- Move/refactor: `native/macos/CAHQBankMac/Sources/Models/**`
- Move/refactor: `native/macos/CAHQBankMac/Sources/Services/**`
- Move/refactor: `native/macos/CAHQBankMac/Sources/ViewModels/**`

- [ ] **Step 1: Introduce shared service boundary**

Create a shared protocol layer so UI code depends on a qbank service abstraction rather than directly constructing `QBankService.connectedToLocalRepo(...)`.

Minimum behavior:

- Shared view model can bootstrap from an injected content/store provider.
- Mac provider keeps the current local repo locator behavior.
- iOS provider can later use bundled or app-private content without pretending a local repo root exists.

- [ ] **Step 2: Move platform-neutral types into shared folders**

Move platform-neutral code under `Sources/Shared/`, keeping imports limited to frameworks available on both macOS and iOS where possible:

- `Foundation`
- `SwiftUI` only for shared views that truly compile on both platforms.
- SQLite layer if it compiles for both macOS and iOS.

Do not move AppKit-specific code into shared folders.

- [ ] **Step 3: Gate Mac-only APIs**

Keep or move these behind Mac-only files/conditional compilation:

- `import AppKit`
- `NSOpenPanel`
- `NSWorkspace`
- `NSPasteboard`
- Finder/open-repo actions.
- Local repo chooser copy.

- [ ] **Step 4: Verify Mac still works**

Run:

```bash
AGENT_NAME=CODEX make -C native/macos/CAHQBankMac agent-verify
```

Expected:

- Existing Mac behavior still passes.

- [ ] **Step 5: Commit**

```bash
git add native/macos/CAHQBankMac
git commit -m "refactor: split shared and mac native qbank code"
```

### Task 3: Add Minimal iOS Target And Shell

**Files:**
- Modify: `native/macos/CAHQBankMac/project.yml`
- Create: `native/macos/CAHQBankMac/Sources/iOS/CAHQBankiOSApp.swift`
- Create: `native/macos/CAHQBankMac/Sources/iOS/iOSRootView.swift`
- Create: `native/macos/CAHQBankMac/Tests/iOSTests/`

- [ ] **Step 1: Add iOS target in XcodeGen**

Add an iPhone/iOS target that uses shared sources plus `Sources/iOS`.

Keep Mac target unchanged for existing development workflows.

- [ ] **Step 2: Add minimal iPhone shell**

Create a simple iPhone SwiftUI shell that can compile and show the core app sections with mobile-appropriate navigation.

Do not fully polish iPhone UI in this task.

- [ ] **Step 3: Add placeholder iOS content adapter**

Implement the minimum iOS adapter needed to compile and bootstrap:

- Prefer bundled/static question snapshot or app-private documents storage.
- Do not rely on selecting the repo root with `NSOpenPanel`.
- Do not require full cross-device sync in this pass.

- [ ] **Step 4: Generate/update Xcode project**

Run:

```bash
cd native/macos/CAHQBankMac
xcodegen generate
```

Expected:

- Project regenerates with Mac and iOS targets/schemes.

- [ ] **Step 5: Build Mac and iOS**

Run Mac:

```bash
AGENT_NAME=CODEX make -C native/macos/CAHQBankMac agent-verify
```

Run iOS with an available simulator destination:

```bash
DESTINATION="$(cd native/macos/CAHQBankMac && scripts/resolve_sim_destination.sh)"
xcodebuild \
  -project native/macos/CAHQBankMac/CAHQBankMac.xcodeproj \
  -scheme CAHQBankiOS \
  -destination "$DESTINATION" \
  build
```

- [ ] **Step 6: Commit**

```bash
git add native/macos/CAHQBankMac
git commit -m "feat: add initial iphone qbank target"
```

### Task 4: Code Review Checkpoint

**Files:**
- No code changes unless review finds issues.

- [ ] **Step 1: Request review**

Use `superpowers:requesting-code-review` with:

- What was implemented: shared Apple-platform foundation and initial iOS target.
- Requirements: Mac behavior remains intact; iOS target compiles; no Mac release implementation yet.

- [ ] **Step 2: Evaluate feedback**

Use `superpowers:receiving-code-review`.

- Fix Critical and Important issues before continuing.
- Push back only with concrete code/test evidence.

## Phase 2: Mac Developer ID DMG

### Task 5: Add Mac Release Signing Configuration

**Files:**
- Modify: `native/macos/CAHQBankMac/project.yml`
- Modify: `native/macos/CAHQBankMac/Sources/Info.plist`
- Create: `native/macos/CAHQBankMac/Sources/Mac/CAHQBankMac.entitlements` if entitlements are needed.

- [ ] **Step 1: Configure Release settings**

Add Release-only settings for the Mac target:

- Enable Hardened Runtime.
- Ensure debug-only entitlements are not present in Release.
- Add `LSApplicationCategoryType = public.app-category.education`.
- Keep bundle identifier stable unless explicitly changed later.

- [ ] **Step 2: Preserve dev names**

Keep the internal Mac target/scheme/module usable as `CAHQBankMac`.

Use `CAH QBank` as the human-facing app display name and release-staged app name.

- [ ] **Step 3: Generate project and verify**

```bash
cd native/macos/CAHQBankMac
xcodegen generate
AGENT_NAME=CODEX make agent-verify
```

- [ ] **Step 4: Commit**

```bash
git add native/macos/CAHQBankMac
git commit -m "build: configure mac release signing settings"
```

### Task 6: Add App Icon Assets

**Files:**
- Modify: `native/macos/CAHQBankMac/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Create: `native/macos/CAHQBankMac/Resources/Assets.xcassets/AppIcon.appiconset/*.png`
- Create: `native/macos/CAHQBankMac/scripts/generate-app-icon.swift` or equivalent built-in-tool script.

- [ ] **Step 1: Generate simple CAH icon**

Create a repo-owned icon suitable for both Mac and iPhone until final artwork exists.

Use a simple CAH QBank visual mark and generate required sizes.

- [ ] **Step 2: Verify asset catalog references files**

Ensure `Contents.json` includes filenames for all required app icon slots.

- [ ] **Step 3: Build Mac and iOS**

```bash
AGENT_NAME=CODEX make -C native/macos/CAHQBankMac agent-verify
DESTINATION="$(cd native/macos/CAHQBankMac && scripts/resolve_sim_destination.sh)"
xcodebuild -project native/macos/CAHQBankMac/CAHQBankMac.xcodeproj -scheme CAHQBankiOS -destination "$DESTINATION" build
```

- [ ] **Step 4: Commit**

```bash
git add native/macos/CAHQBankMac/Resources native/macos/CAHQBankMac/scripts
git commit -m "design: add cah qbank app icon assets"
```

### Task 7: Add Mac Release Script And Docs

**Files:**
- Create: `native/macos/CAHQBankMac/scripts/preflight-apple-release.sh`
- Create: `native/macos/CAHQBankMac/scripts/release-mac.sh`
- Create: `native/macos/CAHQBankMac/docs/release.md`

- [ ] **Step 1: Implement preflight checks**

Preflight must check:

- Xcode command line tools.
- `xcodebuild`.
- `xcodegen`.
- `xcrun notarytool`.
- Developer ID Application identity, using `DEVELOPER_ID_APPLICATION` if provided or auto-detecting exactly one identity.
- `NOTARYTOOL_PROFILE`, default `CAH_QBANK_NOTARY`.

Do not store credentials in repo.

- [ ] **Step 2: Implement Mac release flow**

`release-mac.sh` should:

- Run preflight.
- Generate project.
- Archive Release.
- Stage app as `CAH QBank.app`.
- Code sign with Developer ID.
- Submit to notary service and wait.
- Staple app.
- Build a DMG with `CAH QBank.app` and `/Applications` shortcut.
- Sign, notarize, staple, and verify the DMG.
- Write outputs under ignored `native/macos/CAHQBankMac/build/release/`.

- [ ] **Step 3: Document credential setup**

Document:

- Required Apple Developer Program membership.
- Developer ID Application certificate.
- Notary keychain profile setup.
- Environment variables.
- Expected artifact path.
- Common failure modes.

- [ ] **Step 4: Verify missing-credential failure is clean**

Run:

```bash
native/macos/CAHQBankMac/scripts/release-mac.sh
```

Expected on machines without Developer ID credentials:

- Script exits before doing release work.
- Error explains exactly which credential/profile is missing.
- No claim of a finished distributable artifact.

- [ ] **Step 5: Commit**

```bash
git add native/macos/CAHQBankMac/scripts native/macos/CAHQBankMac/docs
git commit -m "build: add mac developer id release workflow"
```

### Task 8: Verify Mac Release When Credentials Exist

**Files:**
- No tracked source changes unless verification exposes required fixes.

- [ ] **Step 1: Run release script**

With credentials installed:

```bash
DEVELOPER_ID_APPLICATION="Developer ID Application: <Name> (<TEAMID>)" \
NOTARYTOOL_PROFILE="CAH_QBANK_NOTARY" \
native/macos/CAHQBankMac/scripts/release-mac.sh
```

- [ ] **Step 2: Verify app and DMG**

Run:

```bash
codesign --verify --strict --verbose=2 "native/macos/CAHQBankMac/build/release/CAH QBank.app"
codesign -dvvv --entitlements :- "native/macos/CAHQBankMac/build/release/CAH QBank.app"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH QBank.app"
spctl -a -vv "native/macos/CAHQBankMac/build/release/CAH QBank.app"
hdiutil verify "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
spctl -a -vv -t open "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
```

Expected:

- Developer ID signature is present.
- Hardened Runtime is enabled.
- No debug entitlement is present.
- Stapler validates both app and DMG.
- Gatekeeper accepts app and DMG.

- [ ] **Step 3: Commit verification fixes only if needed**

If tracked fixes were required:

```bash
git add native/macos/CAHQBankMac
git commit -m "fix: harden mac release verification"
```

## Phase 3: iPhone Packaging And Polish

### Task 9: Define iPhone Content Strategy

**Files:**
- Modify: `native/macos/CAHQBankMac/Sources/iOS/**`
- Modify/Create: shared content adapter files under `Sources/Shared/`
- Test: `native/macos/CAHQBankMac/Tests/iOSTests/**`

- [ ] **Step 1: Choose and implement v1 content mode**

Use one v1 mode:

- Bundled published question snapshot for offline use, plus local app-private SQLite study state.

Do not add cloud sync or repo-root selection in v1 unless a later plan explicitly asks for it.

- [ ] **Step 2: Add tests**

Add tests proving:

- iOS can bootstrap without a Mac repo path.
- Bundled/app-private content loads.
- Practice sessions and progress state write to app-private SQLite.

- [ ] **Step 3: Build iOS**

```bash
DESTINATION="$(cd native/macos/CAHQBankMac && scripts/resolve_sim_destination.sh)"
xcodebuild -project native/macos/CAHQBankMac/CAHQBankMac.xcodeproj -scheme CAHQBankiOS -destination "$DESTINATION" test
```

- [ ] **Step 4: Commit**

```bash
git add native/macos/CAHQBankMac
git commit -m "feat: add iphone offline content store"
```

### Task 10: Polish iPhone UI For Daily Use

**Files:**
- Modify: `native/macos/CAHQBankMac/Sources/iOS/**`
- Modify shared views only where cross-platform behavior remains clean.

- [ ] **Step 1: Replace Mac sidebar assumptions**

Use iPhone-appropriate navigation:

- Tab or stack navigation.
- Compact dashboard.
- Browse and practice flows optimized for touch.

- [ ] **Step 2: Keep platform-specific UI separate**

Do not force Mac layouts to fit iPhone if separate shells are clearer.

- [ ] **Step 3: Test on simulator**

Run iPhone simulator build/test and manually inspect:

- Dashboard.
- Browse.
- Question detail.
- Practice answer submission.
- Progress.

- [ ] **Step 4: Commit**

```bash
git add native/macos/CAHQBankMac/Sources/iOS native/macos/CAHQBankMac/Sources/Shared
git commit -m "feat: polish iphone qbank flows"
```

### Task 11: Add iPhone Distribution Notes

**Files:**
- Modify: `native/macos/CAHQBankMac/docs/release.md`
- Modify: `native/macos/CAHQBankMac/project.yml` if signing settings are needed.

- [ ] **Step 1: Document iPhone signing path**

Document:

- Bundle identifier.
- Development team setup.
- Simulator build.
- Device build.
- TestFlight/App Store archive path.

- [ ] **Step 2: Do not confuse distribution tracks**

Mac distribution remains Developer ID DMG.

iPhone distribution is iOS archive/TestFlight/App Store; do not use Developer ID notarization for iPhone.

- [ ] **Step 3: Commit**

```bash
git add native/macos/CAHQBankMac/docs native/macos/CAHQBankMac/project.yml
git commit -m "docs: add iphone distribution notes"
```

## Final Review And Handoff

### Task 12: Final Code Review

**Files:**
- No code changes unless review requires fixes.

- [ ] **Step 1: Request final review**

Use `superpowers:requesting-code-review` with:

- Base SHA: commit before Phase 1.
- Head SHA: latest implementation commit.
- Requirements: shared Apple-platform foundation, notarized Mac DMG workflow, iPhone target/content/UI/distribution notes.

- [ ] **Step 2: Receive review rigorously**

Use `superpowers:receiving-code-review`.

- Fix Critical issues.
- Fix Important issues.
- Log Minor issues for later unless they are quick and low-risk.

- [ ] **Step 3: Run final verification**

Minimum:

```bash
AGENT_NAME=CODEX make -C native/macos/CAHQBankMac agent-verify
DESTINATION="$(cd native/macos/CAHQBankMac && scripts/resolve_sim_destination.sh)"
xcodebuild -project native/macos/CAHQBankMac/CAHQBankMac.xcodeproj -scheme CAHQBankiOS -destination "$DESTINATION" test
```

With Developer ID credentials installed, also run:

```bash
native/macos/CAHQBankMac/scripts/release-mac.sh
```

- [ ] **Step 4: Push implementation branch**

```bash
git push origin <implementation-branch>
```

## Non-Goals

- Do not implement cloud sync in this plan.
- Do not lower the Mac deployment target in this plan.
- Do not replace the browser app.
- Do not add third-party release dependencies unless explicitly approved later.
- Do not stage `.claude/worktrees/blissful-curran-af5382` unless explicitly asked.
