# CAH QBank Apple Release

This project has two separate Apple distribution tracks:

- Mac direct distribution: Developer ID signed, notarized, stapled DMG.
- iPhone distribution: iOS archive for TestFlight or App Store. Developer ID notarization does not apply to iPhone apps.

## Mac Developer ID DMG

Prerequisites:

- Apple Developer Program membership.
- Xcode command line tools selected.
- `xcodegen` available on `PATH`.
- A valid `Developer ID Application` certificate in the login keychain.
- A notarytool keychain profile. The default expected profile name is `CAH_QBANK_NOTARY`.

Create the notary profile once on the release Mac:

```bash
xcrun notarytool store-credentials "CAH_QBANK_NOTARY"
```

If more than one Developer ID Application certificate is installed, set the exact identity:

```bash
export DEVELOPER_ID_APPLICATION="Developer ID Application: Your Name (TEAMID)"
```

Run a preflight check:

```bash
native/macos/CAHQBankMac/scripts/preflight-apple-release.sh
```

Build the signed and notarized DMG:

```bash
NOTARYTOOL_PROFILE="CAH_QBANK_NOTARY" \
native/macos/CAHQBankMac/scripts/release-mac.sh
```

Expected outputs are written under:

```text
native/macos/CAHQBankMac/build/release/
```

The final DMG name is versioned, for example:

```text
native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg
```

## Mac Verification

The release script runs these checks after signing and notarization:

```bash
codesign --verify --strict --verbose=2 "native/macos/CAHQBankMac/build/release/CAH QBank.app"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH QBank.app"
spctl -a -vv "native/macos/CAHQBankMac/build/release/CAH QBank.app"
hdiutil verify "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
xcrun stapler validate "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
spctl -a -vv -t open "native/macos/CAHQBankMac/build/release/CAH-QBank-1.0.dmg"
```

Common failures:

- No Developer ID Application certificate: install the certificate in Keychain Access or set `DEVELOPER_ID_APPLICATION` to the exact installed identity.
- Missing notary profile: run `xcrun notarytool store-credentials "CAH_QBANK_NOTARY"`.
- Gatekeeper rejection: inspect `codesign -dvvv --entitlements :-` and confirm the app was signed with Developer ID and hardened runtime.
- Notary rejection: retrieve the notary log from the failed submission and fix the binary or signing issue it names.

## iPhone Build And Distribution

Current bundle identifier:

```text
com.anirudhbalachandar.CAHQBank.iOS
```

The current iPhone target is an iPhone-only target named `CAHQBankiOS`. It shares the Swift model/service layer with the Mac app and has its own SwiftUI shell.

Simulator verification:

```bash
DESTINATION="$(cd native/macos/CAHQBankMac && scripts/resolve_sim_destination.sh)"
xcodebuild \
  -project native/macos/CAHQBankMac/CAHQBankMac.xcodeproj \
  -scheme CAHQBankiOS \
  -destination "$DESTINATION" \
  test
```

For device, TestFlight, or App Store distribution, configure an Apple Development or Apple Distribution signing team in Xcode or via release-specific build settings, then archive the `CAHQBankiOS` scheme for iOS. Do not use the Mac Developer ID DMG workflow for iPhone builds.
