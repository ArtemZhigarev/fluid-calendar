import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WaitlistStatusAPI";

// Public endpoint - no auth required
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const referralCode = searchParams.get("referralCode");

    if (!email && !referralCode) {
      return NextResponse.json(
        { error: "Email or referralCode query parameter is required" },
        { status: 400 }
      );
    }

    // Check beta settings to see what info to expose
    const betaSettings = await prisma.betaSettings.findFirst();
    const showQueuePosition = betaSettings?.showQueuePosition ?? true;
    const showTotalWaitlist = betaSettings?.showTotalWaitlist ?? true;

    const entry = await prisma.waitlist.findFirst({
      where: {
        ...(email && { email }),
        ...(referralCode && { referralCode }),
      },
      select: {
        status: true,
        referralCode: true,
        referralCount: true,
        priorityScore: true,
        createdAt: true,
        invitedAt: true,
      },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Not found on waitlist" },
        { status: 404 }
      );
    }

    let position: number | null = null;
    let totalWaiting: number | null = null;

    if (entry.status === "WAITING" && showQueuePosition) {
      position =
        (await prisma.waitlist.count({
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
        })) + 1;
    }

    if (showTotalWaitlist) {
      totalWaiting = await prisma.waitlist.count({
        where: { status: "WAITING" },
      });
    }

    return NextResponse.json({
      status: entry.status,
      referralCode: entry.referralCode,
      referralCount: entry.referralCount,
      ...(position !== null && { position }),
      ...(totalWaiting !== null && { totalWaiting }),
      ...(entry.invitedAt && { invitedAt: entry.invitedAt }),
    });
  } catch (error) {
    logger.error(
      "Failed to check waitlist status:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to check waitlist status" },
      { status: 500 }
    );
  }
}
