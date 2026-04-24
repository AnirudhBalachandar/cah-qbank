import SwiftUI

struct iOSRootView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        TabView(selection: selection) {
            NavigationStack {
                iOSDashboardView(model: model)
            }
            .tabItem {
                Label("Dashboard", systemImage: "rectangle.grid.2x2")
            }
            .tag(AppViewModel.NavigationSection.dashboard)

            NavigationStack {
                iOSBrowseView(model: model)
            }
            .tabItem {
                Label("Browse", systemImage: "book")
            }
            .tag(AppViewModel.NavigationSection.browse)

            NavigationStack {
                iOSPracticeView(model: model)
            }
            .tabItem {
                Label("Practice", systemImage: "play.circle")
            }
            .tag(AppViewModel.NavigationSection.practice)

            NavigationStack {
                iOSProgressView(model: model)
            }
            .tabItem {
                Label("Progress", systemImage: "chart.bar")
            }
            .tag(AppViewModel.NavigationSection.progress)
        }
    }

    private var selection: Binding<AppViewModel.NavigationSection> {
        Binding(
            get: { model.selection ?? .dashboard },
            set: { model.selection = $0 }
        )
    }
}

private struct iOSDashboardView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label("CAH QBank", systemImage: "checklist.checked")
                        .font(.title2.bold())
                    Text("iPhone")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Your mobile question library is not linked yet.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Content") {
                metricRow("Published questions", value: model.dashboard?.publishedCount ?? 0)
                metricRow("Practice-ready", value: model.dashboard?.answerableCount ?? 0)
                metricRow("Flagged", value: model.dashboard?.flaggedCount ?? 0)
                metricRow("Notes", value: model.dashboard?.noteCount ?? 0)
            }

            Section("Status") {
                Text(model.infoMessage)
                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await model.syncNow()
        }
    }

    private func metricRow(_ title: String, value: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text("\(value)")
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
        }
    }
}

private struct iOSBrowseView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section {
                TextField("Search questions", text: $model.browseSearch)
                    .textInputAutocapitalization(.never)
                    .onSubmit {
                        Task { await model.loadBrowse(page: 1) }
                    }

                Button {
                    Task { await model.loadBrowse(page: 1) }
                } label: {
                    Label("Apply Search", systemImage: "magnifyingglass")
                }
                .disabled(model.isBusy)
            }

            Section {
                ForEach(model.browseSnapshot.questions) { question in
                    NavigationLink {
                        iOSQuestionDetailView(question: question)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(question.stem)
                                .font(.body.weight(.medium))
                                .lineLimit(3)
                            Text(question.curriculum.rawValue)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if question.flagged {
                                Label("Flagged", systemImage: "flag.fill")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            } header: {
                Text("\(model.browseSnapshot.total) questions")
            }

            if model.browseSnapshot.pageCount > 1 {
                Section {
                    HStack {
                        Button("Previous") {
                            Task { await model.loadBrowse(page: max(1, model.browseSnapshot.page - 1)) }
                        }
                        .disabled(model.browseSnapshot.page <= 1 || model.isBusy)

                        Spacer()

                        Text("\(model.browseSnapshot.page) / \(model.browseSnapshot.pageCount)")
                            .foregroundStyle(.secondary)

                        Spacer()

                        Button("Next") {
                            Task { await model.loadBrowse(page: min(model.browseSnapshot.pageCount, model.browseSnapshot.page + 1)) }
                        }
                        .disabled(model.browseSnapshot.page >= model.browseSnapshot.pageCount || model.isBusy)
                    }
                }
            }
        }
        .navigationTitle("Browse")
        .refreshable {
            await model.loadBrowse()
        }
    }
}

private struct iOSQuestionDetailView: View {
    let question: QBankQuestion

    var body: some View {
        List {
            Section("Question") {
                Text(question.stem)
                Text(question.curriculum.rawValue)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Options") {
                ForEach(question.options, id: \.key) { option in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(option.key). \(option.text)")
                        if option.isCorrect == true {
                            Label("Correct answer", systemImage: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }
                }
            }

            if let explanation = question.explanation, !explanation.isEmpty {
                Section("Explanation") {
                    Text(explanation)
                }
            }
        }
        .navigationTitle("Question")
    }
}

private struct iOSPracticeView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section("Session") {
                Picker("Focus", selection: $model.practiceTagID) {
                    Text("All questions").tag("")
                    ForEach(model.practiceTags) { tag in
                        Text(tag.name).tag(tag.slug)
                    }
                }

                Stepper(value: $model.practiceQuestionCount, in: 1...50) {
                    Text("\(model.practiceQuestionCount) questions")
                }

                Button {
                    Task { await model.startPractice() }
                } label: {
                    Label(model.activeSession == nil ? "Start Practice" : "Start New Practice", systemImage: "play.circle")
                }
                .disabled(model.isBusy || model.practiceTags.isEmpty)
            }

            if let session = model.activeSession {
                iOSPracticeSessionSection(model: model, session: session)
            } else {
                Section {
                    ContentUnavailableView(
                        "No Active Session",
                        systemImage: "play.circle",
                        description: Text("Choose a focus and start practice.")
                    )
                }
            }
        }
        .navigationTitle("Practice")
    }
}

private struct iOSPracticeSessionSection: View {
    @ObservedObject var model: AppViewModel
    let session: SessionSnapshot

    @State private var currentIndex = 0
    @State private var selectedKey = ""
    @State private var result: AnswerResult?

    private var question: QBankQuestion? {
        guard session.questions.indices.contains(currentIndex) else { return session.questions.first }
        return session.questions[currentIndex]
    }

    var body: some View {
        Section("Question \(min(currentIndex + 1, session.questions.count)) of \(session.questions.count)") {
            if let question {
                Text(question.stem)
                    .font(.headline)

                ForEach(question.options, id: \.key) { option in
                    Button {
                        selectedKey = option.key
                    } label: {
                        HStack {
                            Text("\(option.key). \(option.text)")
                                .foregroundStyle(.primary)
                            Spacer()
                            if selectedKey == option.key {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }

                if let result {
                    Label(result.isCorrect ? "Correct" : "Review answer", systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(result.isCorrect ? .green : .orange)
                    if let explanation = result.explanation, !explanation.isEmpty {
                        Text(explanation)
                            .font(.callout)
                    }
                }

                Button {
                    Task {
                        result = await model.submitAnswer(questionID: question.id, selectedKey: selectedKey)
                    }
                } label: {
                    Label("Submit Answer", systemImage: "checkmark.circle")
                }
                .disabled(selectedKey.isEmpty || model.isBusy || session.answeredByQuestion[question.id] != nil)

                HStack {
                    Button("Previous") {
                        currentIndex = max(0, currentIndex - 1)
                        selectedKey = ""
                        result = nil
                    }
                    .disabled(currentIndex <= 0)

                    Spacer()

                    Button("Next") {
                        currentIndex = min(session.questions.count - 1, currentIndex + 1)
                        selectedKey = ""
                        result = nil
                    }
                    .disabled(currentIndex >= session.questions.count - 1)
                }
            }
        }
    }
}

private struct iOSProgressView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            if model.progressRows.isEmpty {
                ContentUnavailableView(
                    "No Progress Yet",
                    systemImage: "chart.bar",
                    description: Text("Complete practice questions to build progress.")
                )
            } else {
                ForEach(model.progressRows) { row in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(row.name)
                            .font(.body.weight(.medium))
                        HStack {
                            Text("\(row.questionCount) questions")
                            Spacer()
                            Text("\(Int(row.elo.rounded())) ELO")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Progress")
    }
}
