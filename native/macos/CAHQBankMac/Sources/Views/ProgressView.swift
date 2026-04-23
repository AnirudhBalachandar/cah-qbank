import SwiftUI

struct ProgressView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Progress")
                .font(.largeTitle.bold())
            Text("Track mastery by curriculum and topic tag using the same Elo model as the web app.")
                .foregroundStyle(.secondary)

            if model.progressRows.isEmpty {
                ContentUnavailableView("No Progress Yet", systemImage: "chart.line.downtrend.xyaxis", description: Text("Answer a few practice questions to start building mastery history."))
            } else {
                Table(model.progressRows) {
                    TableColumn("Tag") { row in
                        Text(row.name)
                    }
                    TableColumn("Kind") { row in
                        Text(row.kind.rawValue.capitalized)
                    }
                    TableColumn("Elo") { row in
                        Text(row.elo.formatted(.number.precision(.fractionLength(1))))
                    }
                    TableColumn("Attempts") { row in
                        Text("\(row.attemptCount)")
                    }
                    TableColumn("Correct") { row in
                        Text("\(row.correctCount)")
                    }
                    TableColumn("Questions") { row in
                        Text("\(row.questionCount)")
                    }
                }
            }
        }
        .padding(24)
    }
}
