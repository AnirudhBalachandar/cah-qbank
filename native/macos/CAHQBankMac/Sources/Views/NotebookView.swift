import SwiftUI

struct NotebookView: View {
    @ObservedObject var model: AppViewModel

    private var notes: [QBankQuestion] {
        model.browseSnapshot.questions.filter { !$0.noteMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private var bookmarks: [QBankQuestion] {
        model.browseSnapshot.questions.filter(\.flagged)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Notebook")
                        .font(.largeTitle.bold())
                    Text("Saved explanations, private notes, and bookmarked questions.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 10) {
                    NativeNotebookPill(title: "All Notes", value: notes.count + bookmarks.count)
                    NativeNotebookPill(title: "My Notes", value: notes.count)
                    NativeNotebookPill(title: "Bookmarks", value: bookmarks.count)
                }

                if notes.isEmpty && bookmarks.isEmpty {
                    ContentUnavailableView(
                        "No Notes Yet",
                        systemImage: "text.book.closed",
                        description: Text("Save notes from question detail or explanation screens.")
                    )
                    .frame(maxWidth: .infinity, minHeight: 360)
                } else {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(notes.prefix(20)) { question in
                            NativeNotebookQuestionCard(question: question, badge: "MY NOTE", badgeColor: .blue)
                        }
                        ForEach(bookmarks.prefix(20)) { question in
                            NativeNotebookQuestionCard(question: question, badge: "BOOKMARK", badgeColor: .red)
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

private struct NativeNotebookPill: View {
    let title: String
    let value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.title3.bold())
        }
        .frame(minWidth: 120, alignment: .leading)
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct NativeNotebookQuestionCard: View {
    let question: QBankQuestion
    let badge: String
    let badgeColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(badge)
                    .font(.caption.bold())
                    .foregroundStyle(badgeColor)
                Spacer()
                Text(question.curriculum.rawValue)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(question.noteMarkdown.isEmpty ? question.stem : question.noteMarkdown)
                .font(.callout)
                .foregroundStyle(.primary)
                .lineLimit(3)
            HStack(spacing: 8) {
                if let tag = question.tags.first {
                    Text(tag.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(question.flagged ? "Flagged" : "Saved")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(question.flagged ? .red : .secondary)
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
