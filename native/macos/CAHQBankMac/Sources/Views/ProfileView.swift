import SwiftUI

struct ProfileView: View {
    @ObservedObject var model: AppViewModel
    @AppStorage(CAHAppearanceMode.storageKey) private var appearanceRawValue = CAHAppearanceMode.light.rawValue
    @AppStorage("cah.profile.offlineContent") private var offlineContent = true
    @AppStorage("cah.profile.notifications") private var notifications = true
    @AppStorage("cah.profile.compactCards") private var compactCards = false

    private var appearanceMode: CAHAppearanceMode {
        CAHAppearanceMode.normalized(appearanceRawValue)
    }

    private var darkModeBinding: Binding<Bool> {
        Binding(
            get: { appearanceMode == .dark },
            set: { isDark in
                appearanceRawValue = isDark ? CAHAppearanceMode.dark.rawValue : CAHAppearanceMode.light.rawValue
            }
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Profile")
                        .font(.largeTitle.bold())
                    Text("Local learner settings and library status.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 16) {
                        Text("AB")
                            .font(.title.bold())
                            .frame(width: 72, height: 72)
                            .background(.purple.opacity(0.12), in: Circle())
                            .foregroundStyle(.purple)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Alex Brown")
                                .font(.title3.bold())
                            Text("alex.brown@cahqbank.com")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                            Text("CAH QBank Local")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.blue)
                        }
                    }

                    Divider()

                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Your plan")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("CAH QBank Local")
                                .font(.headline)
                            Text(model.libraryStatusDetail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("Active")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
                .padding(18)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                VStack(spacing: 0) {
                    NativeProfileToggleRow(
                        systemImage: appearanceMode.systemImage,
                        title: "Dark mode",
                        subtitle: appearanceMode == .dark ? "Dark appearance is enabled across the app." : "Light appearance is enabled across the app.",
                        isOn: darkModeBinding
                    )
                    NativeProfileToggleRow(
                        systemImage: "arrow.down.to.line",
                        title: "Download content",
                        subtitle: offlineContent ? "Bundled database is available offline." : "Offline cache is disabled for this Mac.",
                        isOn: $offlineContent
                    )
                    NativeProfileToggleRow(
                        systemImage: "bell",
                        title: "Study reminders",
                        subtitle: notifications ? "Local study reminders are enabled." : "Local study reminders are disabled.",
                        isOn: $notifications
                    )
                    NativeProfileToggleRow(
                        systemImage: "rectangle.compress.vertical",
                        title: "Compact cards",
                        subtitle: compactCards ? "Compact card density is enabled." : "Comfortable card density is enabled.",
                        isOn: $compactCards
                    )
                }
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .padding(24)
            .frame(maxWidth: 760, alignment: .leading)
        }
    }
}

private struct NativeProfileToggleRow: View {
    let systemImage: String
    let title: String
    let subtitle: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 24)
                    .foregroundStyle(.blue)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.callout.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
    }
}
