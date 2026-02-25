import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "TaskChangesAPI";

export async function GET(
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

    // Verify the task belongs to the user
    const task = await prisma.task.findUnique({
      where: { id, userId },
      select: { id: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const synced = searchParams.get("synced");

    const where = {
      taskId: id,
      userId,
      ...(synced !== null && synced !== undefined && synced !== "" && {
        synced: synced === "true",
      }),
    };

    const [changes, total] = await Promise.all([
      prisma.taskChange.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          provider: {
            select: { id: true, name: true, type: true },
          },
          mapping: {
            select: { id: true, externalListName: true },
          },
        },
      }),
      prisma.taskChange.count({ where }),
    ]);

    return NextResponse.json({
      changes,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
    });
  } catch (error) {
    logger.error(
      "Failed to fetch task changes:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch task changes" },
      { status: 500 }
    );
  }
}
