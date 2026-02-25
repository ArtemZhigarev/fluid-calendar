import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminWaitlistIdAPI";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;
    const entry = await prisma.waitlist.findUnique({ where: { id } });

    if (!entry) {
      return NextResponse.json(
        { error: "Waitlist entry not found" },
        { status: 404 }
      );
    }

    // Compute position (count of entries with higher priority score or earlier creation)
    const position = await prisma.waitlist.count({
      where: {
        status: "WAITING",
        OR: [
          { priorityScore: { gt: entry.priorityScore } },
          {
            priorityScore: entry.priorityScore,
            createdAt: { lt: entry.createdAt },
          },
        ],
      },
    });

    return NextResponse.json({
      ...entry,
      position: entry.status === "WAITING" ? position + 1 : null,
    });
  } catch (error) {
    logger.error(
      "Failed to get waitlist entry:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to get waitlist entry" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;
    const body = await request.json();
    const { notes, priorityScore, queueNotificationsEnabled, status } = body;

    const entry = await prisma.waitlist.findUnique({ where: { id } });
    if (!entry) {
      return NextResponse.json(
        { error: "Waitlist entry not found" },
        { status: 404 }
      );
    }

    // Validate status if provided
    if (status && !["WAITING", "INVITED", "REGISTERED"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be WAITING, INVITED, or REGISTERED" },
        { status: 400 }
      );
    }

    const updatedEntry = await prisma.waitlist.update({
      where: { id },
      data: {
        ...(notes !== undefined && { notes }),
        ...(priorityScore !== undefined && { priorityScore }),
        ...(queueNotificationsEnabled !== undefined && {
          queueNotificationsEnabled,
        }),
        ...(status !== undefined && { status }),
      },
    });

    logger.info(
      `Admin updated waitlist entry ${id}`,
      { updates: Object.keys(body) },
      LOG_SOURCE
    );

    return NextResponse.json(updatedEntry);
  } catch (error) {
    logger.error(
      "Failed to update waitlist entry:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update waitlist entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;

    const entry = await prisma.waitlist.findUnique({ where: { id } });
    if (!entry) {
      return NextResponse.json(
        { error: "Waitlist entry not found" },
        { status: 404 }
      );
    }

    await prisma.waitlist.delete({ where: { id } });

    logger.info(
      `Admin deleted waitlist entry ${id}`,
      { email: entry.email },
      LOG_SOURCE
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete waitlist entry:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete waitlist entry" },
      { status: 500 }
    );
  }
}
