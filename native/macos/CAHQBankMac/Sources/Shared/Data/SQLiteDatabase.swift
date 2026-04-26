import Foundation
import SQLite3

enum SQLiteBindValue: Sendable {
    case integer(Int64)
    case double(Double)
    case text(String)
    case bool(Bool)
    case null
}

enum SQLiteColumnValue: Sendable {
    case integer(Int64)
    case double(Double)
    case text(String)
    case null
}

struct SQLiteRow: Sendable {
    let values: [String: SQLiteColumnValue]

    func string(_ column: String) throws -> String {
        guard let value = values[column] else {
            throw RepoStoreError.missingColumn(column)
        }
        switch value {
        case let .text(text):
            return text
        case let .integer(number):
            return String(number)
        case let .double(number):
            return String(number)
        case .null:
            return ""
        }
    }

    func optionalString(_ column: String) throws -> String? {
        guard let value = values[column] else {
            throw RepoStoreError.missingColumn(column)
        }
        switch value {
        case let .text(text):
            return text
        case let .integer(number):
            return String(number)
        case let .double(number):
            return String(number)
        case .null:
            return nil
        }
    }

    func int(_ column: String) throws -> Int {
        guard let value = values[column] else {
            throw RepoStoreError.missingColumn(column)
        }
        switch value {
        case let .integer(number):
            return Int(number)
        case let .double(number):
            return Int(number)
        case let .text(text):
            return Int(text) ?? 0
        case .null:
            return 0
        }
    }

    func double(_ column: String) throws -> Double {
        guard let value = values[column] else {
            throw RepoStoreError.missingColumn(column)
        }
        switch value {
        case let .integer(number):
            return Double(number)
        case let .double(number):
            return number
        case let .text(text):
            return Double(text) ?? 0
        case .null:
            return 0
        }
    }

    func bool(_ column: String) throws -> Bool {
        try int(column) != 0
    }
}

final class SQLiteDatabase {
    private let handle: OpaquePointer

    init(path: String, readOnly: Bool = false) throws {
        let directory = URL(fileURLWithPath: path).deletingLastPathComponent()
        if !readOnly {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        var db: OpaquePointer?
        let flags = if readOnly {
            SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_URI
        } else {
            SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_URI
        }
        if sqlite3_open_v2(path, &db, flags, nil) != SQLITE_OK || db == nil {
            let message = db.flatMap { sqlite3_errmsg($0).map { String(cString: $0) } } ?? "Unable to open database"
            if let db {
                sqlite3_close(db)
            }
            throw RepoStoreError.sqliteFailure(message)
        }
        handle = db!
        try execute("PRAGMA foreign_keys = ON;")
    }

    deinit {
        sqlite3_close(handle)
    }

    func ensureSchema() throws {
        var errorPointer: UnsafeMutablePointer<Int8>?
        if sqlite3_exec(handle, schemaSQL, nil, nil, &errorPointer) != SQLITE_OK {
            let message = errorPointer.map { String(cString: $0) } ?? "Unknown SQLite schema error"
            sqlite3_free(errorPointer)
            throw RepoStoreError.sqliteFailure(message)
        }
    }

    func execute(_ sql: String, bindings: [SQLiteBindValue] = []) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw RepoStoreError.sqliteFailure(lastErrorMessage(sql: sql))
        }
        defer { sqlite3_finalize(statement) }
        try bind(bindings, to: statement)
        let result = sqlite3_step(statement)
        guard result == SQLITE_DONE || result == SQLITE_ROW else {
            throw RepoStoreError.sqliteFailure(lastErrorMessage(sql: sql))
        }
    }

    func query(_ sql: String, bindings: [SQLiteBindValue] = []) throws -> [SQLiteRow] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw RepoStoreError.sqliteFailure(lastErrorMessage(sql: sql))
        }
        defer { sqlite3_finalize(statement) }
        try bind(bindings, to: statement)

        var rows: [SQLiteRow] = []
        while true {
            let stepResult = sqlite3_step(statement)
            if stepResult == SQLITE_DONE {
                break
            }
            guard stepResult == SQLITE_ROW else {
                throw RepoStoreError.sqliteFailure(lastErrorMessage(sql: sql))
            }

            var values: [String: SQLiteColumnValue] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, index))
                let type = sqlite3_column_type(statement, index)
                switch type {
                case SQLITE_INTEGER:
                    values[name] = .integer(sqlite3_column_int64(statement, index))
                case SQLITE_FLOAT:
                    values[name] = .double(sqlite3_column_double(statement, index))
                case SQLITE_TEXT:
                    let text = sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
                    values[name] = .text(text)
                default:
                    values[name] = .null
                }
            }
            rows.append(SQLiteRow(values: values))
        }
        return rows
    }

    func transaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE TRANSACTION;")
        do {
            let result = try body()
            try execute("COMMIT;")
            return result
        } catch {
            try? execute("ROLLBACK;")
            throw error
        }
    }

    private func bind(_ bindings: [SQLiteBindValue], to statement: OpaquePointer) throws {
        for (index, binding) in bindings.enumerated() {
            let parameterIndex = Int32(index + 1)
            let code: Int32
            switch binding {
            case let .integer(value):
                code = sqlite3_bind_int64(statement, parameterIndex, value)
            case let .double(value):
                code = sqlite3_bind_double(statement, parameterIndex, value)
            case let .text(value):
                code = sqlite3_bind_text(statement, parameterIndex, value, -1, sqliteTransient)
            case let .bool(value):
                code = sqlite3_bind_int(statement, parameterIndex, value ? 1 : 0)
            case .null:
                code = sqlite3_bind_null(statement, parameterIndex)
            }
            guard code == SQLITE_OK else {
                throw RepoStoreError.sqliteFailure(lastErrorMessage(sql: "binding"))
            }
        }
    }

    private func lastErrorMessage(sql: String) -> String {
        let message = sqlite3_errmsg(handle).map { String(cString: $0) } ?? "Unknown SQLite error"
        return "\(message) while running SQL: \(sql)"
    }
}

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private let schemaSQL = """
CREATE TABLE IF NOT EXISTS "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stem" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "explanation" TEXT,
    "citations" TEXT NOT NULL,
    "curriculum" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "sourceFingerprint" TEXT NOT NULL UNIQUE,
    "rationale" TEXT,
    "optionExplanations" TEXT NOT NULL,
    "moduleCode" TEXT,
    "difficulty" TEXT,
    "ausScore" INTEGER,
    "source" TEXT NOT NULL,
    "isAnswerable" BOOLEAN NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "Tag" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentSlug" TEXT,
    CONSTRAINT "Tag_parentSlug_fkey" FOREIGN KEY ("parentSlug") REFERENCES "Tag" ("slug") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "QuestionTag" (
    "questionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("questionId", "tagId"),
    CONSTRAINT "QuestionTag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "PracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "questionIds" TEXT NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
CREATE TABLE IF NOT EXISTS "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "selectedKey" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER,
    "confidence" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Flag" (
    "questionId" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Flag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "UserNote" (
    "questionId" TEXT NOT NULL PRIMARY KEY,
    "noteMarkdown" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserNote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TagMastery" (
    "tagId" TEXT NOT NULL PRIMARY KEY,
    "elo" REAL NOT NULL DEFAULT 1000,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TagMastery_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Question_status_idx" ON "Question"("status");
CREATE INDEX IF NOT EXISTS "Tag_slug_idx" ON "Tag"("slug");
CREATE INDEX IF NOT EXISTS "Attempt_sessionId_createdAt_idx" ON "Attempt"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "TagMastery_tagId_idx" ON "TagMastery"("tagId");
CREATE UNIQUE INDEX IF NOT EXISTS "Attempt_sessionId_questionId_key" ON "Attempt"("sessionId", "questionId");
CREATE TABLE IF NOT EXISTS "LibraryMetadata" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);
"""
