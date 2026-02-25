import { NextRequest, NextResponse } from "next/server";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WaitlistJoinAPI";

// Public endpoint - no auth required
export async function POST(request: NextRequest) {
  try {
    const { email, name, referralCode, interestedInLifetime } =
      await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Check if already on waitlist
    const existingWaitlist = await prisma.waitlist.findUnique({
      where: { email },
    });
    if (existingWaitlist) {
      return NextResponse.json(
        { error: "Email is already on the waitlist" },
        { status: 409 }
      );
    }

    // Check if already pending
    const existingPending = await prisma.pendingWaitlist.findUnique({
      where: { email },
    });
    if (existingPending) {
      return NextResponse.json(
        { error: "A verification email has already been sent to this address" },
        { status: 409 }
      );
    }

    // Validate referral code if provided
    if (referralCode) {
      const referrer = await prisma.waitlist.findUnique({
        where: { referralCode },
      });
      if (!referrer) {
        return NextResponse.json(
          { error: "Invalid referral code" },
          { status: 400 }
        );
      }
    }

    // Generate verification token
    const verificationToken = `ver_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    const now = newDate();
    const verificationExpiry = new Date(now);
    verificationExpiry.setHours(verificationExpiry.getHours() + 24);

    const pending = await prisma.pendingWaitlist.create({
      data: {
        email,
        name,
        referralCode: referralCode || undefined,
        verificationToken,
        verificationExpiry,
        interestedInLifetime: interestedInLifetime || false,
      },
    });

    logger.info(
      `New waitlist signup: ${email}`,
      { email, hasReferral: !!referralCode },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      message: "Please check your email to verify your address",
      id: pending.id,
    });
  } catch (error) {
    logger.error(
      "Failed to join waitlist:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 }
    );
  }
}
