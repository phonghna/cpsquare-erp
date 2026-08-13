import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { internalMessages, messageRecipients, appUsers } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { TEAMS } from "./recipients/route";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();

  const inboxRows = await db
    .select()
    .from(messageRecipients)
    .where(eq(messageRecipients.receiverUserId, session.userId));

  const sentMessages = await db
    .select()
    .from(internalMessages)
    .where(eq(internalMessages.senderId, session.userId))
    .orderBy(desc(internalMessages.createdAt));

  const inboxMessageIds = inboxRows.map((r) => r.messageId);
  const inboxMessages = inboxMessageIds.length
    ? await db.select().from(internalMessages).where(inArray(internalMessages.messageId, inboxMessageIds))
    : [];

  const allSenderIds = Array.from(new Set([...inboxMessages.map((m) => m.senderId)]));
  const senders = allSenderIds.length
    ? await db.select({ userId: appUsers.userId, displayName: appUsers.displayName }).from(appUsers).where(inArray(appUsers.userId, allSenderIds))
    : [];
  const senderNameById = new Map(senders.map((s) => [s.userId, s.displayName]));

  const recipientCountByMessage = new Map<string, number>();
  const allRecipRows = sentMessages.length
    ? await db.select().from(messageRecipients).where(inArray(messageRecipients.messageId, sentMessages.map((m) => m.messageId)))
    : [];
  for (const r of allRecipRows) {
    recipientCountByMessage.set(r.messageId, (recipientCountByMessage.get(r.messageId) || 0) + 1);
  }

  const inboxById = new Map(inboxMessages.map((m) => [m.messageId, m]));
  const inbox = inboxRows
    .map((r) => {
      const m = inboxById.get(r.messageId);
      if (!m) return null;
      return {
        messageId: m.messageId,
        subject: m.subject,
        body: m.body,
        senderId: m.senderId,
        senderName: senderNameById.get(m.senderId) || m.senderId,
        createdAt: m.createdAt,
        isRead: r.isRead,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const sent = sentMessages.map((m) => ({
    messageId: m.messageId,
    subject: m.subject,
    body: m.body,
    createdAt: m.createdAt,
    recipientCount: recipientCountByMessage.get(m.messageId) || 0,
  }));

  return NextResponse.json({ inbox, sent });
}

// Compose / send / quick-reply. Resolves individuals ∪ everyone on the
// selected teams (matched by app_users.team_allocation), excluding the sender.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subject, body, recipientUserIds = [], recipientTeams = [], parentId = null } = await req.json();
  if (!subject || !body) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  const validTeams = (recipientTeams as string[]).filter((t) => TEAMS.includes(t));
  if (recipientUserIds.length === 0 && validTeams.length === 0) {
    return NextResponse.json({ error: "Pick at least one recipient or team." }, { status: 400 });
  }

  const db = getDb();
  const recipientSet = new Set<string>(recipientUserIds);

  if (validTeams.length > 0) {
    const teamUsers = await db
      .select({ userId: appUsers.userId, teamAllocation: appUsers.teamAllocation })
      .from(appUsers)
      .where(and(eq(appUsers.isActive, true), inArray(appUsers.teamAllocation, validTeams)));
    for (const u of teamUsers) recipientSet.add(u.userId);
  }
  recipientSet.delete(session.userId);

  if (recipientSet.size === 0) {
    return NextResponse.json({ error: "No valid recipients after resolving teams." }, { status: 400 });
  }

  const messageId = randomUUID();
  await db.insert(internalMessages).values({
    messageId,
    senderId: session.userId,
    subject,
    body,
    parentId: parentId || null,
  });
  await db.insert(messageRecipients).values(
    Array.from(recipientSet).map((receiverUserId) => ({
      recipientRowId: randomUUID(),
      messageId,
      receiverUserId,
    }))
  );

  return NextResponse.json({ ok: true, messageId, recipientCount: recipientSet.size });
}
