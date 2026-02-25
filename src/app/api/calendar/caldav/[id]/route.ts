import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CalDAVCalendarIdAPI";

interface UpdateRequest {
  enabled?: boolean;
  color?: string;
}

// Update a CalDAV Calendar feed
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id,
        userId,
      },
      include: { account: true },
    });

    if (!feed || feed.type !== "CALDAV" || !feed.accountId) {
      return NextResponse.json(
        { error: "Invalid calendar feed" },
        { status: 400 }
      );
    }

    const updates = (await request.json()) as UpdateRequest;

    // Update only local properties
    const updatedFeed = await prisma.calendarFeed.update({
      where: { id, userId },
      data: {
        enabled: updates.enabled,
        color: updates.color,
      },
    });

    return NextResponse.json(updatedFeed);
  } catch (error) {
    logger.error(
      "Failed to update CalDAV calendar:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update calendar" },
      { status: 500 }
    );
  }
}

// Delete a CalDAV Calendar feed
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id,
        userId,
      },
    });

    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    if (feed.type !== "CALDAV") {
      return NextResponse.json(
        { error: "Feed is not a CalDAV calendar" },
        { status: 400 }
      );
    }

    // Delete the feed (events cascade-delete per schema)
    await prisma.calendarFeed.delete({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete CalDAV calendar:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete calendar" },
      { status: 500 }
    );
  }
}
