import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AccountIdAPI";

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

    const account = await prisma.connectedAccount.findUnique({
      where: { id, userId },
      include: {
        calendars: {
          select: {
            id: true,
            name: true,
            type: true,
            enabled: true,
            color: true,
            lastSync: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: account.id,
      provider: account.provider,
      email: account.email,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      calendars: account.calendars,
    });
  } catch (error) {
    logger.error(
      "Failed to get account:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to get account" },
      { status: 500 }
    );
  }
}

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

    const account = await prisma.connectedAccount.findUnique({
      where: { id, userId },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    // First delete all calendar feeds associated with this account
    await prisma.calendarFeed.deleteMany({
      where: { accountId: id, userId },
    });

    // Then delete the account
    await prisma.connectedAccount.delete({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete account:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
