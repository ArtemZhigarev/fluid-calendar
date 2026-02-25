import { NextRequest, NextResponse } from "next/server";

import { newDate } from "@/lib/date-utils";
import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminPendingWaitlistAPI";

export async function GET(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const [entries, total] = await Promise.all([
      prisma.pendingWaitlist.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pendingWaitlist.count(),
    ]);

    return NextResponse.json({
      entries,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to list pending waitlist:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list pending waitlist entries" },
      { status: 500 }
    );
  }
}

// Clean up expired pending entries
export async function DELETE(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const result = await prisma.pendingWaitlist.deleteMany({
      where: {
        verificationExpiry: { lt: newDate() },
      },
    });

    logger.info(
      `Cleaned up ${result.count} expired pending waitlist entries`,
      { deleted: result.count },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      deleted: result.count,
    });
  } catch (error) {
    logger.error(
      "Failed to cleanup pending waitlist:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to cleanup pending waitlist entries" },
      { status: 500 }
    );
  }
}
