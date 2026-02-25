import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AllTaskChangesAPI";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const synced = searchParams.get("synced");
    const changeType = searchParams.get("changeType");

    const where = {
      userId,
      ...(synced !== null && synced !== undefined && synced !== "" && {
        synced: synced === "true",
      }),
      ...(changeType && { changeType }),
    };

    const [changes, total] = await Promise.all([
      prisma.taskChange.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          task: {
            select: { id: true, title: true, status: true },
          },
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
