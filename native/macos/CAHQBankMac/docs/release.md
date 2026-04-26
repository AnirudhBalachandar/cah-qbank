# CAH QBank Apple Release

This project has three Apple distribution lanes:

- Primary Mac beta distribution: App Store Connect upload for internal TestFlight on macOS.
- Secondary Mac direct distribution: Developer ID signed, notarized, stapled DMG.
- iPhone distribution: App Store Connect upload for internal TestFlight on iOS.

The Mac and iPhone App Store Connect lanes use the same high-level workflow:

1. Regenerate the Xcode project from `project.yml`.
2. Run a release preflight for the target platform.
3. Archive a Release build with automatic Apple signing.
4. Export locally or upload to App Store Connect after explicit confirmation.

## Mac App Store Connect And TestFlight

Current Mac App Store Connect settings:

- Scheme: `CAHQBankMac`
- Display name: `CAH QBank`
- Bundle identifier: `com.anirudhbalachandar.CAHQBank`
- Team ID: `3DELSD6G98`
- Version: `1.0`
- Build: `5`
- Entitlements: App Sandbox enabled at `Sources/Mac/CAHQBankMac.entitlements`
- Bundled library: `3,060` published questions, including `3,056` practice-ready and `4` browse-only questions.

Run the Mac App Store/TestFlight preflight:

```bash
native/macos/CAHQBankMac/scripts/preflight-mac-appstore-release.sh
```

Archive for Mac App Store Connect distribution:

```bash
native/macos/CAHQBankMac/scripts/release-mac-appstore.sh
```

Create a local App Store Connect export without uploading:

```bash
native/macos/CAHQBankMac/scripts/release-mac-appstore.sh --export --skip-archive
```

Expected local export folder:

```text
native/macos/CAHQBankMac/build/mac-appstore-release/export/
```

Upload the archived Mac build to App Store Connect for internal TestFlight only after confirming the App Store Connect app record:

```bash
CONFIRM_MAC_UPLOAD=YES native/macos/CAHQBankMac/scripts/release-mac-appstore.sh --upload --skip-archive
```

Do not treat a successful upload as TestFlight availability. App Store Connect can still be processing the uploaded build after `xcodebuild -exportArchive` completes.

## Mac Direct Distribution DMG

The direct-distribution lane remains available for sharing a notarized app outside the Mac App Store. It is not the primary beta/review path.

Prerequisites:

- Apple Developer Program membership.
- Xcode command line tools selected.
- `xcodegen` available on `PATH`.
- A valid `Developer ID Application` certificate in the login keychain.
- Notary credentials, either a notarytool keychain profile or an App Store Connect API key.

Build the signed and notarized DMG:

```bash
NOTARYTOOL_PROFILE="CAH_QBANK_NOTARY" \
native/macos/CAHQBankMac/scripts/release-mac.sh
```

If more than one Developer ID Application certificate is installed, set the exact identity:

```bash
export DEVELOPER_ID_APPLICATION="Developer ID Application: Your Name (TEAMID)"
```

Expected direct-distribution outputs are written under:

```text
native/macos/CAHQBankMac/build/release/
```

The final DMG name is versioned, for example:

```text
native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg
```

The release script also writes:

```text
native/macos/CAHQBankMac/build/release/release-manifest.txt
```

The manifest records version, build, final artifact paths, SHA-256 checksums, and bundled question counts.

## Mac Verification

For the primary Mac App Store Connect lane, verify:

```bash
make -C native/macos/CAHQBankMac build
make -C native/macos/CAHQBankMac test
native/macos/CAHQBankMac/scripts/preflight-mac-appstore-release.sh
native/macos/CAHQBankMac/scripts/release-mac-appstore.sh
```

For the secondary DMG lane, `release-mac.sh` runs these distribution checks after signing and notarization:

```bash
codesign --verify --strict --verbose=2 "native/macos/CAHQBankMac/build/release/CAH QBank.app"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH QBank.app"
spctl -a -vv "native/macos/CAHQBankMac/build/release/CAH QBank.app"
hdiutil verify "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
spctl -a -vv -t install "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
```

Manual app verification should launch the built or released Mac app itself and check Dashboard, Browse, Practice, Progress, Notebook, and Profile. Build success alone is not enough.

## iPhone Build And Distribution

Current iPhone settings:

- Scheme: `CAHQBankiOS`
- Display name: `CAH QBank`
- Bundle identifier: `com.anirudhbalachandar.CAHQBank.iOS`
- Team ID: `3DELSD6G98`
- Version: `1.0`
- Build: `5`
- Target device family: iPhone

Simulator verification:

```bash
DESTINATION="$(cd native/macos/CAHQBankMac && scripts/resolve_sim_destination.sh)"
xcodebuild \
  -project native/macos/CAHQBankMac/CAHQBankMac.xcodeproj \
  -scheme CAHQBankiOS \
  -destination "$DESTINATION" \
  test
```

Release preflight:

```bash
native/macos/CAHQBankMac/scripts/preflight-ios-release.sh
```

Archive for iOS distribution:

```bash
native/macos/CAHQBankMac/scripts/release-ios.sh
```

Create a local App Store Connect IPA export without uploading:

```bash
native/macos/CAHQBankMac/scripts/release-ios.sh --export --skip-archive
```

Expected local export:

```text
native/macos/CAHQBankMac/build/ios-release/export/CAH QBank.ipa
```

Upload the archived build to App Store Connect for internal TestFlight only after explicit action-time confirmation and after confirming the App Store Connect app record:

```bash
CONFIRM_IOS_UPLOAD=YES native/macos/CAHQBankMac/scripts/release-ios.sh --upload --skip-archive
```

For device, TestFlight, or App Store distribution, use Apple Development or Apple Distribution signing for the `CAHQBankiOS` scheme. Do not use the Mac Developer ID DMG workflow for iPhone builds.

Physical iPhone installation from Xcode or `devicectl` requires Developer Mode to be enabled on the iPhone. If installation fails with `Developer Mode is disabled`, enable it on the device under Settings > Privacy & Security > Developer Mode, then restart and confirm on the iPhone before retrying the install.
