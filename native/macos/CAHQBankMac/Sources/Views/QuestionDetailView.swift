import SwiftUI

struct QuestionDetailView: View {
    let question: QBankQuestion
    let onToggleFlag: () async -> Void
    let onSaveNote: (String) async -> Void

    @State private var noteDraft = ""
    @State private var persistedNote = ""
    @FocusState private var noteEditorFocused: Bool

    private var noteActionTitle: String {
        noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Clear Note" : "Save Note"
    }

    private var hasUnsavedNoteChanges: Bool {
        noteDraft != persistedNote
    }

    private var noteStatusText: String {
        if hasUnsavedNoteChanges {
            return "Unsaved note changes"
        }
        if noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "No private note saved"
        }
        return "Private note saved"
    }

    private var noteStatusSymbol: String {
        if hasUnsavedNoteChanges {
            return "pencil.circle"
        }
        if noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "note.text"
        }
        return "checkmark.circle"
    }

    private var noteStatusColor: Color {
        hasUnsavedNoteChanges ? .orange : .secondary
    }

    private var visibleTopicTags: [QuestionTag] {
        question.tags.filter { $0.kind == .topic }
    }

    private func syncNoteState(with question: QBankQuestion) {
        if noteDraft == persistedNote {
            noteDraft = question.noteMarkdown
        }
        persistedNote = question.noteMarkdown
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            DetailBadge(text: question.curriculum.rawValue, systemImage: "books.vertical")
                            DetailBadge(text: question.createdBy.rawValue, systemImage: "person.crop.rectangle")
                            if !question.isAnswerable {
                                DetailBadge(text: "Browse Only", systemImage: "eye.slash", tint: .orange)
                            }
                            if question.flagged {
                                DetailBadge(text: "Flagged", systemImage: "flag.fill", tint: .orange)
                            }
                        }

                        Text(question.stem)
                            .font(.title2.weight(.semibold))
                            .textSelection(.enabled)

                        HStack(spacing: 12) {
                            if let correctKey = question.correctKey {
                                Label("Best answer \(correctKey)", systemImage: "checkmark.seal")
                            }
                            Label("\(question.attemptCount) attempts", systemImage: "number")
                            Label("\(question.correctCount) correct", systemImage: "chart.bar")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button(question.flagged ? "Remove Flag" : "Flag Question") {
                        Task {
                            await onToggleFlag()
                        }
                    }
                    .buttonStyle(.bordered)
                    .foregroundStyle(question.flagged ? Color.orange : Color.primary)
                    .keyboardShortcut("f", modifiers: [.command, .shift])
                }

                if !visibleTopicTags.isEmpty {
                    GroupBox("Tags") {
                        Text(visibleTopicTags.map(\.name).joined(separator: " · "))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                }

                GroupBox("Answer Key") {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(question.options, id: \.key) { option in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(alignment: .top, spacing: 10) {
                                    Text(option.key + ".")
                                        .fontWeight(.semibold)
                                    Text(option.text)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer()
                                    if option.isCorrect == true {
                                        Label("Correct", systemImage: "checkmark.circle.fill")
                                            .foregroundStyle(.green)
                                    }
                                }

                                if let explanation = question.optionExplanations[option.key], !explanation.isEmpty {
                                    Text(explanation)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .padding(.leading, 26)
                                        .textSelection(.enabled)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }

                if let explanation = question.explanation, !explanation.isEmpty {
                    GroupBox("Explanation") {
                        Text(explanation)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                }

                if let rationale = question.rationale, !rationale.isEmpty {
                    GroupBox("Rationale") {
                        Text(rationale)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                }

                if !question.citations.isEmpty {
                    GroupBox("Citations") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(question.citations.enumerated()), id: \.offset) { index, citation in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(index + 1). \(citation.title ?? citation.source ?? "Untitled citation")")
                                    if let source = citation.source, source != citation.title {
                                        Text(source)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    if let url = citation.url, let destination = URL(string: url) {
                                        Link(url, destination: destination)
                                            .font(.caption)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                GroupBox("Private Note") {
                    VStack(alignment: .leading, spacing: 10) {
                        ZStack(alignment: .topLeading) {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(.regularMaterial)

                            if noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text("Add a reminder, pitfall, or follow-up note for this question.")
                                    .foregroundStyle(.tertiary)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 12)
                                    .allowsHitTesting(false)
                            }

                            TextEditor(text: $noteDraft)
                                .focused($noteEditorFocused)
                                .scrollContentBackground(.hidden)
                                .padding(8)
                                .frame(minHeight: 140)
                                .accessibilityLabel("Private note")
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(
                                    hasUnsavedNoteChanges ? Color.orange.opacity(0.7) :
                                        noteEditorFocused ? Color.accentColor.opacity(0.4) : Color.clear,
                                    lineWidth: 1.5
                                )
                        }

                        HStack(spacing: 10) {
                            Label(noteStatusText, systemImage: noteStatusSymbol)
                                .font(.caption)
                                .foregroundStyle(noteStatusColor)

                            Spacer()

                            Button("Focus Note") {
                                noteEditorFocused = true
                            }
                            .buttonStyle(.link)

                            if hasUnsavedNoteChanges {
                                Button("Revert") {
                                    noteDraft = persistedNote
                                }
                            }

                            Button(noteActionTitle) {
                                let note = noteDraft
                                Task {
                                    await onSaveNote(note)
                                }
                            }
                            .keyboardShortcut("s", modifiers: [.command])
                            .disabled(!hasUnsavedNoteChanges)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("Metadata") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Question ID: \(question.id)")
                        Text("Source fingerprint: \(question.sourceFingerprint)")
                        if let difficulty = question.difficulty {
                            Text("Difficulty: \(difficulty.rawValue)")
                        }
                        if let moduleCode = question.moduleCode, !moduleCode.isEmpty {
                            Text("Module: \(moduleCode)")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                }
            }
            .padding(.trailing, 4)
        }
        .onAppear {
            noteDraft = question.noteMarkdown
            persistedNote = question.noteMarkdown
        }
        .onChange(of: question) { _, newQuestion in
            syncNoteState(with: newQuestion)
        }
    }
}

private struct DetailBadge: View {
    let text: String
    let systemImage: String
    var tint: Color = .secondary

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: Capsule())
    }
}
