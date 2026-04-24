import SwiftUI

struct BrowseView: View {
    @ObservedObject var model: AppViewModel

    private var visibleRangeLabel: String {
        guard model.browseSnapshot.total > 0 else { return "0 questions" }
        let start = ((model.browseSnapshot.page - 1) * 30) + 1
        let end = min(model.browseSnapshot.page * 30, model.browseSnapshot.total)
        return "Showing \(start)-\(end) of \(model.browseSnapshot.total)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header

            HSplitView {
                filterRail
                    .frame(minWidth: 300, idealWidth: 330, maxWidth: 380)

                questionList
                    .frame(minWidth: 360, idealWidth: 430)

                detailPane
                    .frame(minWidth: 460)
            }
        }
        .padding(24)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Browse Questions")
                    .font(.largeTitle.bold())
                Text("Search, filter, and launch targeted practice from published CAH questions.")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(visibleRangeLabel)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private var filterRail: some View {
        VStack(alignment: .leading, spacing: 14) {
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("Search question stems", text: $model.browseSearch)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit {
                            Task { await model.loadBrowse(page: 1) }
                        }

                    Picker("Curriculum", selection: $model.browseCurriculum) {
                        Text("All curricula").tag("")
                        ForEach(model.curriculumOptions, id: \.self) { curriculum in
                            Text(curriculum).tag(curriculum)
                        }
                    }

                    Picker("Topic", selection: $model.browseTag) {
                        Text("All topics").tag("")
                        ForEach(model.browseSnapshot.tagOptions) { tag in
                            Text(tag.name).tag(tag.slug)
                        }
                    }

                    HStack {
                        Button("Apply") {
                            Task { await model.loadBrowse(page: 1) }
                        }
                        .keyboardShortcut(.return, modifiers: [.command])

                        Button("Clear") {
                            model.browseSearch = ""
                            model.browseCurriculum = ""
                            model.browseTag = ""
                            Task { await model.loadBrowse(page: 1) }
                        }
                        .disabled(model.browseSearch.isEmpty && model.browseCurriculum.isEmpty && model.browseTag.isEmpty)
                    }
                }
                .padding(4)
            } label: {
                Label("Filters", systemImage: "line.3.horizontal.decrease.circle")
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(model.practiceTags.prefix(10)) { tag in
                        Button {
                            model.browseTag = tag.kind == .topic ? tag.slug : model.browseTag
                            model.browseCurriculum = tag.kind == .curriculum ? tag.name : model.browseCurriculum
                            Task { await model.loadBrowse(page: 1) }
                        } label: {
                            NativeTopicProgressRow(tag: tag)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)
            } label: {
                Label("Coverage", systemImage: "chart.bar.doc.horizontal")
            }

            Spacer()
        }
    }

    private var questionList: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(model.browseSnapshot.total) questions")
                    .font(.headline)
                Spacer()
                Text("Page \(model.browseSnapshot.page) of \(model.browseSnapshot.pageCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            List(selection: $model.selectedQuestionID) {
                ForEach(model.browseSnapshot.questions) { question in
                    NativeQuestionRow(question: question)
                        .tag(question.id)
                        .padding(.vertical, 4)
                }
            }
            .listStyle(.inset)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .onChange(of: model.selectedQuestionID) { _, newValue in
                Task { await model.selectQuestion(id: newValue) }
            }

            HStack {
                Button("Previous") {
                    Task { await model.loadBrowse(page: max(1, model.browseSnapshot.page - 1)) }
                }
                .disabled(model.browseSnapshot.page <= 1)

                Spacer()

                Button("Next") {
                    Task { await model.loadBrowse(page: min(model.browseSnapshot.pageCount, model.browseSnapshot.page + 1)) }
                }
                .disabled(model.browseSnapshot.page >= model.browseSnapshot.pageCount)
            }
        }
    }

    private var detailPane: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let question = model.selectedQuestion {
                QuestionDetailView(
                    question: question,
                    onToggleFlag: { await model.toggleFlagForSelectedQuestion() },
                    onSaveNote: { note in await model.saveNoteForSelectedQuestion(note) }
                )
            } else {
                ContentUnavailableView(
                    "Select a Question",
                    systemImage: "doc.text.magnifyingglass",
                    description: Text("Choose a question to review stem, options, notes, and references.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativeTopicProgressRow: View {
    let tag: PracticeTagSummary

    private var progress: Double {
        min(max((tag.elo - 800) / 600, 0.08), 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(tag.name)
                    .font(.callout.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text("\(tag.questionCount)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            SwiftUI.ProgressView(value: progress)
                .tint(.green)
        }
        .padding(10)
        .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct NativeQuestionRow: View {
    let question: QBankQuestion

    private var accuracy: Int? {
        guard question.attemptCount > 0 else { return nil }
        return Int((Double(question.correctCount) / Double(question.attemptCount) * 100).rounded())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Q-\(question.id.prefix(5).uppercased())")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(question.curriculum.rawValue)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.blue)
                    .lineLimit(1)
                Spacer()
                if question.flagged {
                    Label("Flagged", systemImage: "flag.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Text(question.stem)
                .font(.callout.weight(.semibold))
                .lineLimit(3)

            HStack {
                Label(question.isAnswerable ? "Answerable" : "Browse only", systemImage: question.isAnswerable ? "checkmark.circle" : "eye")
                Text("\(question.attemptCount) attempts")
                if let accuracy {
                    Text("\(accuracy)%")
                        .foregroundStyle(accuracy >= 70 ? .green : .orange)
                }
                Spacer()
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}
