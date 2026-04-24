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
- Notary credentials, either a notarytool keychain profile or an App Store Connect API key.

### One-time Developer ID certificate setup

Apple requires a Developer ID certificate for apps distributed outside the Mac App Store. Apple also limits Developer ID certificate creation to the Apple Developer Program Account Holder. The App Store Connect API can manage many certificate types, but Apple requires Developer ID certificates for macOS to be created through the Apple Developer website or Xcode.

The simplest path is:

1. Open Xcode Settings, then Accounts.
2. Sign in to the Apple Developer account and select the correct team.
3. Open Manage Certificates.
4. Add a `Developer ID Application` certificate.
5. Confirm the identity exists locally:

```bash
security find-identity -p codesigning -v | grep "Developer ID Application"
```

If you are not the Account Holder, ask the Account Holder to create and export a Developer ID Application certificate with its private key as a `.p12`, then import it into the login keychain.

If more than one Developer ID Application certificate is installed, set the exact identity:

```bash
export DEVELOPER_ID_APPLICATION="Developer ID Application: Your Name (TEAMID)"
```

### Notary credentials

Use either a saved notarytool keychain profile or an App Store Connect team API key.

Option A: create a notary profile once on the release Mac:

```bash
xcrun notarytool store-credentials "CAH_QBANK_NOTARY"
```

Then run with:

```bash
NOTARYTOOL_PROFILE="CAH_QBANK_NOTARY" \
native/macos/CAHQBankMac/scripts/release-mac.sh
```

Option B: use an App Store Connect team API key:

```bash
APP_STORE_CONNECT_API_KEY_PATH="$HOME/private_keys/AuthKey_ABC123DEFG.p8" \
APP_STORE_CONNECT_KEY_ID="ABC123DEFG" \
APP_STORE_CONNECT_ISSUER_ID="00000000-0000-0000-0000-000000000000" \
native/macos/CAHQBankMac/scripts/release-mac.sh
```

Do not commit `.p8`, `.p12`, or password files to the repository.

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

- No Developer ID Application certificate: create it in Xcode Accounts, or import an exported `.p12` from the Account Holder.
- `No Account for Team`: sign in to Xcode Settings > Accounts with the Apple Developer account for that team.
- Missing notary profile: run `xcrun notarytool store-credentials "CAH_QBANK_NOTARY"`.
- API key failure: confirm the `.p8` path, key ID, issuer ID, App Store Connect permissions, and that the key is a team key rather than an individual key.
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
