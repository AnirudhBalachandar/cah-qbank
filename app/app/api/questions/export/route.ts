import { NextResponse } from "next/server"

import { getQuestionListCsv, type QuestionListInput, type QuestionSortField, type SortDirection } from "@/lib/qbank"

const validSortFields: QuestionSortField[] = ["createdAt", "stem", "curriculum", "difficulty", "score", "attempts"]

function parseFilters(searchParams: URLSearchParams): QuestionListInput {
  const sort = searchParams.get("sort")
  const direction = searchParams.get("direction")

  return {
    q: searchParams.get("q") ?? undefined,
    curriculum: searchParams.get("curriculum") ?? undefined,
    difficulty: searchParams.get("difficulty") ?? undefined,
    flagged: searchParams.get("flagged") === "true",
    sort: sort && validSortFields.includes(sort as QuestionSortField) ? (sort as QuestionSortField) : undefined,
    direction:
      direction === "asc" || direction === "desc"
        ? (direction as SortDirection)
        : undefined,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const csv = await getQuestionListCsv(parseFilters(url.searchParams))

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cah-dashboard-questions.csv"',
      "Cache-Control": "no-store",
    },
  })
}
