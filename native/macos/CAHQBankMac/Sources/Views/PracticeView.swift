import SwiftUI

struct PracticeView: View {
    @ObservedObject var model: AppViewModel

    private var selectedTagSummary: String {
        guard !model.practiceTagID.isEmpty,
              let tag = model.practiceTags.first(where: { $0.slug == model.practiceTagID }) else {
            return "All answerable questions"
        }
        return "\(tag.name) (\(tag.questionCount))"
    }

    private var startButtonTitle: String {
        model.activeSession == nil ? "Start Session" : "Start New Session"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Start Practice")
                    .font(.largeTitle.bold())
                Text(model.hasLinkedRepo ? model.repoStatusDetail : "Link a repo to launch native practice sessions.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .top, spacing: 20) {
                GroupBox("Session Setup") {
                    VStack(alignment: .leading, spacing: 12) {
                        Picker("Tag Focus", selection: $model.practiceTagID) {
                            Text("All answerable questions").tag("")
                            ForEach(model.practiceTags) { tag in
                                Text("\(tag.name) (\(tag.questionCount))").tag(tag.slug)
                            }
                        }
                        .accessibilityHint("Choose which tag to prioritize for the session.")

                        Stepper(value: $model.practiceQuestionCount, in: 1...100) {
                            Text("Question count: \(model.practiceQuestionCount)")
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Label(selectedTagSummary, systemImage: "tag")
                            Label("\(model.practiceQuestionCount) questions per session", systemImage: "number")
                            if !model.hasLinkedRepo {
                                Label("Practice is unavailable until a repo link is active.", systemImage: "link.badge.plus")
                                    .foregroundStyle(.orange)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Selection rules")
                                .fontWeight(.semibold)
                            Text("Practice uses published questions only.")
                            Text("Questions without a clear single correct answer stay browse-only.")
                            Text("Within a tag, lower-mastery areas surface first.")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        Button(startButtonTitle) {
                            Task {
                                await model.startPractice()
                            }
                        }
                        .keyboardShortcut(.defaultAction)
                        .disabled(!model.hasLinkedRepo || model.isBusy)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(width: 320)

                if let session = model.activeSession {
                    SessionView(model: model, session: session)
                } else {
                    ContentUnavailableView(
                        "No Active Session",
                        systemImage: "play.circle",
                        description: Text("Pick a tag focus and question count to launch a native practice run.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .padding(24)
    }
}

enum PracticeSessionNavigation {
    static func maxUnlockedIndex(for session: SessionSnapshot) -> Int {
        guard !session.questions.isEmpty else { return 0 }

        let lastIndex = session.questions.count - 1
        if session.completedAt != nil || session.answeredByQuestion.count >= session.questions.count {
            return lastIndex
        }

        return min(max(session.currentIndex, 0), lastIndex)
    }

    static func clampedIndex(_ proposedIndex: Int, for session: SessionSnapshot) -> Int {
        guard !session.questions.isEmpty else { return 0 }
        return min(max(proposedIndex, 0), maxUnlockedIndex(for: session))
    }

    static func isUnlocked(index: Int, in session: SessionSnapshot) -> Bool {
        guard session.questions.indices.contains(index) else { return false }
        return index <= maxUnlockedIndex(for: session)
    }
}

private struct SessionView: View {
    @ObservedObject var model: AppViewModel
    let session: SessionSnapshot

    @State private var currentIndex = 0
    @State private var selectedKeys: [String: String] = [:]
    @State private var noteDrafts: [String: String] = [:]
    @State private var persistedNotes: [String: String] = [:]
    @State private var results: [String: AnswerResult] = [:]
    @FocusState private var focusedNoteQuestionID: String?

    private var currentQuestion: QBankQuestion? {
        guard session.questions.indices.contains(currentIndex) else { return session.questions.first }
        return session.questions[currentIndex]
    }

    private var answeredCount: Int {
        session.answeredByQuestion.count
    }

    private var correctCount: Int {
        session.answeredByQuestion.values.filter(\.isCorrect).count
    }

    private var unansweredCount: Int {
        max(session.questions.count - answeredCount, 0)
    }

    private var answeredProgress: Double {
        guard !session.questions.isEmpty else { return 0 }
        return Double(answeredCount) / Double(session.questions.count)
    }

    private var isCompleted: Bool {
        session.completedAt != nil || answeredCount == session.questions.count
    }

    private var maxUnlockedIndex: Int {
        PracticeSessionNavigation.maxUnlockedIndex(for: session)
    }

    private var nextUnansweredIndex: Int? {
        session.questions.firstIndex { session.answeredByQuestion[$0.id] == nil }
    }

    private var currentAttempt: AttemptRecord? {
        guard let currentQuestion else { return nil }
        return session.answeredByQuestion[currentQuestion.id]
    }

    private var currentSelectedKey: String {
        guard let currentQuestion else { return "" }
        return selectedKeys[currentQuestion.id] ?? currentAttempt?.selectedKey ?? ""
    }

    private var canSubmitCurrentQuestion: Bool {
        guard let currentQuestion else { return false }
        return !currentSelectedKey.isEmpty && session.answeredByQuestion[currentQuestion.id] == nil && !model.isBusy
    }

    private func displayedResult(for question: QBankQuestion) -> AnswerResult? {
        if let result = results[question.id] {
            return result
        }
        guard let attempt = session.answeredByQuestion[question.id] else {
            return nil
        }
        return AnswerResult(
            isCorrect: attempt.isCorrect,
            correctKey: question.correctKey,
            correctText: question.options.first(where: { $0.isCorrect == true })?.text,
            explanation: question.explanation,
            citations: question.citations,
            rationale: question.rationale,
            optionExplanations: question.optionExplanations,
            completedAt: session.completedAt != nil,
            nextIndex: session.currentIndex
        )
    }

    private func persistedNote(for question: QBankQuestion) -> String {
        persistedNotes[question.id] ?? question.noteMarkdown
    }

    private func noteDraft(for question: QBankQuestion) -> String {
        noteDrafts[question.id] ?? persistedNote(for: question)
    }

    private func hasUnsavedNoteChanges(for question: QBankQuestion) -> Bool {
        noteDraft(for: question) != persistedNote(for: question)
    }

    private func noteActionTitle(for question: QBankQuestion) -> String {
        noteDraft(for: question).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Clear Note" : "Save Note"
    }

    private func noteStatusText(for question: QBankQuestion) -> String {
        if hasUnsavedNoteChanges(for: question) {
            return "Unsaved note changes"
        }
        if noteDraft(for: question).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "No private note saved"
        }
        return "Private note saved"
    }

    private func noteStatusSymbol(for question: QBankQuestion) -> String {
        if hasUnsavedNoteChanges(for: question) {
            return "pencil.circle"
        }
        if noteDraft(for: question).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "note.text"
        }
        return "checkmark.circle"
    }

    private func noteStatusColor(for question: QBankQuestion) -> Color {
        hasUnsavedNoteChanges(for: question) ? .orange : .secondary
    }

    private func syncState(with session: SessionSnapshot, preserveCurrentQuestion: Bool) {
        let previousQuestionID = preserveCurrentQuestion ? currentQuestion?.id : nil
        let targetIndex: Int
        if let previousQuestionID,
           let preservedIndex = session.questions.firstIndex(where: { $0.id == previousQuestionID }) {
            targetIndex = preservedIndex
        } else {
            targetIndex = session.currentIndex
        }
        currentIndex = PracticeSessionNavigation.clampedIndex(targetIndex, for: session)

        let validIDs = Set(session.questions.map(\.id))
        noteDrafts = noteDrafts.filter { validIDs.contains($0.key) }
        persistedNotes = persistedNotes.filter { validIDs.contains($0.key) }
        results = results.filter { validIDs.contains($0.key) }
        selectedKeys = selectedKeys.filter { validIDs.contains($0.key) }

        for question in session.questions {
            let existingPersisted = persistedNotes[question.id]
            let existingDraft = noteDrafts[question.id]

            if existingDraft == nil || existingDraft == existingPersisted {
                noteDrafts[question.id] = question.noteMarkdown
            }
            persistedNotes[question.id] = question.noteMarkdown

            if let selectedKey = session.answeredByQuestion[question.id]?.selectedKey, selectedKeys[question.id] == nil {
                selectedKeys[question.id] = selectedKey
            }
        }

        if let currentQuestion {
            focusedNoteQuestionID = currentQuestion.id
        }
    }

    private func saveNote(for question: QBankQuestion) {
        let note = noteDraft(for: question)
        Task {
            await model.saveNote(questionID: question.id, note: note)
        }
    }

    private func statusTint(for question: QBankQuestion) -> Color {
        if let attempt = session.answeredByQuestion[question.id] {
            return attempt.isCorrect ? .green : .red
        }
        if question.id == currentQuestion?.id {
            return Color.accentColor
        }
        return .gray
    }

    private func selectionSymbol(isSelected: Bool, isCorrect: Bool, isWrong: Bool) -> String {
        if isCorrect {
            return "checkmark.circle.fill"
        }
        if isWrong {
            return "xmark.circle.fill"
        }
        if isSelected {
            return "largecircle.fill.circle"
        }
        return "circle"
    }

    private func selectionTint(isSelected: Bool, isCorrect: Bool, isWrong: Bool) -> Color {
        if isCorrect {
            return .green
        }
        if isWrong {
            return .red
        }
        if isSelected {
            return Color.accentColor
        }
        return .secondary
    }

    @ViewBuilder
    private func optionButton(for option: QuestionOption, question: QBankQuestion) -> some View {
        let selectedKey = selectedKeys[question.id] ?? session.answeredByQuestion[question.id]?.selectedKey ?? ""
        let revealed = displayedResult(for: question)
        let answered = session.answeredByQuestion[question.id] != nil
        let isSelected = option.key == selectedKey
        let isCorrectOption = revealed?.correctKey == option.key
        let isWrongChoice = answered && session.answeredByQuestion[question.id]?.selectedKey == option.key && session.answeredByQuestion[question.id]?.isCorrect == false

        let button = Button {
            selectedKeys[question.id] = option.key
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: selectionSymbol(isSelected: isSelected, isCorrect: isCorrectOption, isWrong: isWrongChoice))
                    .foregroundStyle(selectionTint(isSelected: isSelected, isCorrect: isCorrectOption, isWrong: isWrongChoice))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top, spacing: 6) {
                        Text(option.key + ".")
                            .fontWeight(.semibold)
                        Text(option.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if isCorrectOption {
                        Label("Best answer", systemImage: "checkmark")
                            .font(.caption)
                            .foregroundStyle(.green)
                    } else if isWrongChoice {
                        Label("Your submitted answer", systemImage: "xmark")
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else if isSelected && !answered {
                        Label("Selected", systemImage: "arrowtriangle.right.fill")
                            .font(.caption)
                            .foregroundStyle(Color.accentColor)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                backgroundColor(isSelected: isSelected, isCorrect: isCorrectOption, isWrong: isWrongChoice),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .disabled(answered || model.isBusy)
        .accessibilityLabel("Option \(option.key)")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")

        if let shortcut = option.key.lowercased().first {
            button.keyboardShortcut(KeyEquivalent(shortcut), modifiers: [])
        } else {
            button
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let question = currentQuestion {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Question \(currentIndex + 1) of \(session.questions.count)")
                                .font(.headline)

                            SwiftUI.ProgressView(value: answeredProgress)
                                .frame(maxWidth: 320)

                            HStack(spacing: 12) {
                                Label("\(answeredCount) answered", systemImage: "checkmark.circle")
                                    .foregroundStyle(.secondary)
                                Label("\(unansweredCount) remaining", systemImage: "circle.dashed")
                                    .foregroundStyle(.secondary)
                                if let attempt = currentAttempt {
                                    Label(
                                        attempt.isCorrect ? "Answered correctly" : "Answered incorrectly",
                                        systemImage: attempt.isCorrect ? "checkmark.seal.fill" : "xmark.seal.fill"
                                    )
                                    .foregroundStyle(attempt.isCorrect ? .green : .red)
                                } else {
                                    Label("Awaiting answer", systemImage: "hourglass")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .font(.caption)
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 10) {
                            if isCompleted {
                                Label("\(correctCount)/\(session.questions.count) correct", systemImage: "checkmark.seal.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            }

                            Button(question.flagged ? "Remove Flag" : "Flag Question") {
                                Task {
                                    await model.toggleFlag(questionID: question.id)
                                }
                            }
                            .buttonStyle(.bordered)
                            .foregroundStyle(question.flagged ? Color.orange : Color.primary)
                            .keyboardShortcut("f", modifiers: [.command, .shift])
                            .disabled(model.isBusy)
                        }
                    }

                    if isCompleted {
                        ContentUnavailableView(
                            "Session Complete",
                            systemImage: "flag.checkered",
                            description: Text("Review answers, jump between questions, or start a new session from the setup panel.")
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else if let nextUnansweredIndex, nextUnansweredIndex != currentIndex {
                        HStack(spacing: 12) {
                            Label("Continue from question \(nextUnansweredIndex + 1)", systemImage: "arrow.forward.circle")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button("Jump to Next Unanswered") {
                                currentIndex = maxUnlockedIndex
                            }
                            .buttonStyle(.link)
                        }
                    }
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(question.stem)
                                .font(.title3.weight(.semibold))
                                .textSelection(.enabled)

                            Text("Press the option letter to select an answer. Command-Return submits, Command-S saves notes.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(question.options, id: \.key) { option in
                                optionButton(for: option, question: question)
                            }
                        }

                        HStack(spacing: 10) {
                            Button("Previous") {
                                currentIndex = max(0, currentIndex - 1)
                            }
                            .keyboardShortcut(.leftArrow, modifiers: [.command])
                            .disabled(currentIndex == 0)

                            Button("Next") {
                                currentIndex = PracticeSessionNavigation.clampedIndex(currentIndex + 1, for: session)
                            }
                            .keyboardShortcut(.rightArrow, modifiers: [.command])
                            .disabled(currentIndex >= maxUnlockedIndex)

                            if let nextUnansweredIndex, nextUnansweredIndex != currentIndex {
                                Button("Next Unanswered") {
                                    currentIndex = maxUnlockedIndex
                                }
                                .disabled(model.isBusy)
                            }

                            Spacer()

                            Button("Finish Session") {
                                Task {
                                    await model.finishSession()
                                }
                            }
                            .disabled(model.isBusy || isCompleted)

                            Button("Submit Answer") {
                                let selected = currentSelectedKey
                                Task {
                                    if let result = await model.submitAnswer(questionID: question.id, selectedKey: selected) {
                                        results[question.id] = result
                                        currentIndex = min(result.nextIndex, max((model.activeSession?.questions.count ?? 1) - 1, 0))
                                    }
                                }
                            }
                            .keyboardShortcut(.return, modifiers: [.command])
                            .disabled(!canSubmitCurrentQuestion)
                        }

                        if let result = displayedResult(for: question) {
                            GroupBox("Result") {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(result.isCorrect ? "Correct" : "Incorrect")
                                        .font(.headline)
                                        .foregroundStyle(result.isCorrect ? .green : .red)

                                    if let correctKey = result.correctKey, let correctText = result.correctText {
                                        Text("Best answer: \(correctKey). \(correctText)")
                                            .font(.subheadline.weight(.semibold))
                                    }

                                    if let explanation = result.explanation, !explanation.isEmpty {
                                        Text(explanation)
                                            .textSelection(.enabled)
                                    }

                                    if let rationale = result.rationale, !rationale.isEmpty {
                                        Text(rationale)
                                            .foregroundStyle(.secondary)
                                            .textSelection(.enabled)
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

                                    if noteDraft(for: question).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text("Capture a short learning point, reminder, or follow-up for this question.")
                                            .foregroundStyle(.tertiary)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 12)
                                            .allowsHitTesting(false)
                                    }

                                    TextEditor(text: Binding(
                                        get: { noteDraft(for: question) },
                                        set: { noteDrafts[question.id] = $0 }
                                    ))
                                    .focused($focusedNoteQuestionID, equals: question.id)
                                    .scrollContentBackground(.hidden)
                                    .padding(8)
                                    .frame(minHeight: 120)
                                    .accessibilityLabel("Private note")
                                }
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(
                                            hasUnsavedNoteChanges(for: question) ? Color.orange.opacity(0.7) :
                                                focusedNoteQuestionID == question.id ? Color.accentColor.opacity(0.4) : Color.clear,
                                            lineWidth: 1.5
                                        )
                                }

                                HStack(spacing: 10) {
                                    Label(noteStatusText(for: question), systemImage: noteStatusSymbol(for: question))
                                        .font(.caption)
                                        .foregroundStyle(noteStatusColor(for: question))

                                    Spacer()

                                    Button("Focus Note") {
                                        focusedNoteQuestionID = question.id
                                    }
                                    .buttonStyle(.link)

                                    if hasUnsavedNoteChanges(for: question) {
                                        Button("Revert") {
                                            noteDrafts[question.id] = persistedNote(for: question)
                                        }
                                    }

                                    Button(noteActionTitle(for: question)) {
                                        saveNote(for: question)
                                    }
                                    .keyboardShortcut("s", modifiers: [.command])
                                    .disabled(!hasUnsavedNoteChanges(for: question) || model.isBusy)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.trailing, 4)
                }

                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        Text("Jump to Question")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if !isCompleted {
                            Label("Future questions unlock as you answer.", systemImage: "lock")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        ForEach(Array(session.questions.enumerated()), id: \.element.id) { index, item in
                            let isUnlocked = PracticeSessionNavigation.isUnlocked(index: index, in: session)
                            Button("\(index + 1)") {
                                currentIndex = index
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(isUnlocked ? statusTint(for: item) : .gray)
                            .opacity(isUnlocked ? (item.id == currentQuestion?.id ? 1 : 0.82) : 0.45)
                            .controlSize(.small)
                            .disabled(!isUnlocked)
                            .help(isUnlocked ? "Jump to question \(index + 1)" : "Question \(index + 1) unlocks after you answer earlier questions.")
                            .accessibilityLabel("Jump to question \(index + 1)")
                            .accessibilityValue(
                                !isUnlocked ? "Locked until earlier questions are answered" :
                                (session.answeredByQuestion[item.id] == nil ?
                                    (item.id == currentQuestion?.id ? "Current, unanswered" : "Unanswered") :
                                    (session.answeredByQuestion[item.id]?.isCorrect == true ? "Answered correctly" : "Answered incorrectly"))
                            )
                        }
                    }
                    .padding(.vertical, 1)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear {
            syncState(with: session, preserveCurrentQuestion: false)
        }
        .onChange(of: session) { _, newSession in
            syncState(with: newSession, preserveCurrentQuestion: true)
        }
    }

    private func backgroundColor(isSelected: Bool, isCorrect: Bool, isWrong: Bool) -> some ShapeStyle {
        if isCorrect {
            return AnyShapeStyle(.green.opacity(0.18))
        }
        if isWrong {
            return AnyShapeStyle(.red.opacity(0.18))
        }
        if isSelected {
            return AnyShapeStyle(.blue.opacity(0.18))
        }
        return AnyShapeStyle(.regularMaterial)
    }
}
