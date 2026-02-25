import { NextRequest, NextResponse } from "next/server";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WaitlistVerifyAPI";

// Public endpoint - no auth required
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Verification token is required" },
        { status: 400 }
      );
    }

    const pending = await prisma.pendingWaitlist.findUnique({
      where: { verificationToken: token },
    });

    if (!pending) {
      return NextResponse.json(
        { error: "Invalid verification token" },
        { status: 404 }
      );
    }

    if (pending.verificationExpiry < newDate()) {
      // Clean up expired entry
      await prisma.pendingWaitlist.delete({
        where: { id: pending.id },
      });
      return NextResponse.json(
        { error: "Verification token has expired" },
        { status: 410 }
      );
    }

    // Check if already on waitlist
    const existingEntry = await prisma.waitlist.findUnique({
      where: { email: pending.email },
    });

    if (existingEntry) {
      // Clean up pending entry
      await prisma.pendingWaitlist.delete({
        where: { id: pending.id },
      });
      return NextResponse.json({
        success: true,
        message: "Email already verified and on waitlist",
      });
    }

    // Generate referral code
    const referralCode = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Handle referral bonus
    const referredBy = pending.referralCode;
    if (referredBy) {
      await prisma.waitlist.updateMany({
        where: { referralCode: referredBy },
        data: {
          referralCount: { increment: 1 },
          priorityScore: { increment: 1.0 },
        },
      });
    }

    // Move from pending to waitlist
    await prisma.$transaction(async (tx) => {
      await tx.waitlist.create({
        data: {
          email: pending.email,
          name: pending.name,
          referralCode,
          referredBy: referredBy || undefined,
          interestedInLifetime: pending.interestedInLifetime,
          status: "WAITING",
        },
      });

      await tx.pendingWaitlist.delete({
        where: { id: pending.id },
      });
    });

    logger.info(
      `Verified and added ${pending.email} to waitlist`,
      { email: pending.email },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      message: "Email verified and added to waitlist",
    });
  } catch (error) {
    logger.error(
      "Failed to verify waitlist entry:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}
