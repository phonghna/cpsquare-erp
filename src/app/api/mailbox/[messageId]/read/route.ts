import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { messageRecipients } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

export async function POST(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  await db
    .update(messageRecipients)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(messageRecipients.messageId, messageId), eq(messageRecipients.receiverUserId, session.userId)));
  return NextResponse.json({ ok: true });
}
