import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { readJsonBody } from "@/lib/server/request-json";
import { noteSchema } from "@/lib/server/schemas";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = noteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { id: questionId } = await params;

  const note = await prisma.userNote.upsert({
    where: {
      userId_questionId: {
        userId: user.id,
        questionId,
      },
    },
    update: {
      noteMarkdown: parsed.data.noteMarkdown,
    },
    create: {
      userId: user.id,
      questionId,
      noteMarkdown: parsed.data.noteMarkdown,
    },
  });

  return NextResponse.json({ updatedAt: note.updatedAt });
}
