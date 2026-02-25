import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminJobsAPI";

export async function GET(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status");
    const queueName = searchParams.get("queueName");
    const userId = searchParams.get("userId");

    const where = {
      ...(status && {
        status: status as
          | "PENDING"
          | "ACTIVE"
          | "COMPLETED"
          | "FAILED"
          | "DELAYED"
          | "PAUSED",
      }),
      ...(queueName && { queueName }),
      ...(userId && { userId }),
    };

    const [jobs, total] = await Promise.all([
      prisma.jobRecord.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jobRecord.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to list jobs:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list jobs" },
      { status: 500 }
    );
  }
}
