import SwiftUI

struct BrowseView: View {
    @ObservedObject var model: AppViewModel

    private var visibleRangeLabel: String {
        guard model.browseSnapshot.total > 0 else { return "0 questions" }
        let start = ((model.browseSnapshot.page - 1) * 30) + 1
        let end = min(model.browseSnapshot.page * 30, model.browseSnapshot.total)
        return "Showing \(start)-\(end) of \(model.browseSnapshot.total)"
    }

    private func topicSummary(for question: QBankQuestion) -> String {
        question.tags
            .filter { $0.kind == .topic }
            .map(\.name)
            .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Browse Questions")
                .font(.largeTitle.bold())

            HStack(spacing: 12) {
                TextField("Search question stems", text: $model.browseSearch)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit {
                        Task {
                            await model.loadBrowse(page: 1)
                        }
                    }

                Picker("Curriculum", selection: $model.browseCurriculum) {
                    Text("All Curricula").tag("")
                    ForEach(model.curriculumOptions, id: \.self) { curriculum in
                        Text(curriculum).tag(curriculum)
                    }
                }
                .frame(width: 240)

                Picker("Tag", selection: $model.browseTag) {
                    Text("All Tags").tag("")
                    ForEach(model.browseSnapshot.tagOptions) { tag in
                        Text(tag.name).tag(tag.slug)
                    }
                }
                .frame(width: 240)

                Button("Apply") {
                    Task {
                        await model.loadBrowse(page: 1)
                    }
                }
                .disabled(model.isBusy)

                Button("Clear") {
                    model.browseSearch = ""
                    model.browseCurriculum = ""
                    model.browseTag = ""
                    Task {
                        await model.loadBrowse(page: 1)
                    }
                }
                .disabled(model.isBusy)
            }

            HSplitView {
                List(selection: $model.selectedQuestionID) {
                    ForEach(model.browseSnapshot.questions) { question in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(question.curriculum.rawValue)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if question.flagged {
                                    Text("Flagged")
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                }
                                if !question.isAnswerable {
                                    Text("Browse only")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                            Text(question.stem)
                                .fontWeight(.medium)
                                .lineLimit(3)
                            let topicSummary = topicSummary(for: question)
                            if !topicSummary.isEmpty {
                                Text(topicSummary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        .padding(.vertical, 6)
                        .tag(question.id)
                    }
                }
                .frame(minWidth: 360)
                .onChange(of: model.selectedQuestionID) { _, newValue in
                    Task {
                        await model.selectQuestion(id: newValue)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text(visibleRangeLabel)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("Page \(model.browseSnapshot.page) of \(model.browseSnapshot.pageCount)")
                            .foregroundStyle(.secondary)
                    }

                    if let question = model.selectedQuestion {
                        QuestionDetailView(
                            question: question,
                            onToggleFlag: {
                                await model.toggleFlagForSelectedQuestion()
                            },
                            onSaveNote: { note in
                                await model.saveNoteForSelectedQuestion(note)
                            }
                        )
                    } else {
                        ContentUnavailableView("Select a Question", systemImage: "doc.text.magnifyingglass", description: Text("Choose a question from the list to review the full record."))
                    }

                    HStack {
                        Button("Previous Page") {
                            Task {
                                await model.loadBrowse(page: max(1, model.browseSnapshot.page - 1))
                            }
                        }
                        .disabled(model.browseSnapshot.page <= 1)

                        Button("Next Page") {
                            Task {
                                await model.loadBrowse(page: min(model.browseSnapshot.pageCount, model.browseSnapshot.page + 1))
                            }
                        }
                        .disabled(model.browseSnapshot.page >= model.browseSnapshot.pageCount)
                    }
                }
            }
        }
        .padding(24)
    }
}
