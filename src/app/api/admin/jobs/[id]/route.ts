import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminJobIdAPI";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;

    const job = await prisma.jobRecord.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    logger.error(
      "Failed to get job record:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to get job record" },
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

    const job = await prisma.jobRecord.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json(
        { error: "Job record not found" },
        { status: 404 }
      );
    }

    await prisma.jobRecord.delete({ where: { id } });

    logger.info(`Admin deleted job record ${id}`, { jobId: id }, LOG_SOURCE);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete job record:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete job record" },
      { status: 500 }
    );
  }
}
