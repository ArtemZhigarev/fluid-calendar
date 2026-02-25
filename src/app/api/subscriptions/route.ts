import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "SubscriptionsAPI";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      // Return default FREE plan if no subscription exists
      return NextResponse.json({
        plan: "FREE",
        status: "ACTIVE",
        stripeCustomerId: null,
        stripePaymentIntentId: null,
        amount: null,
        discountApplied: false,
      });
    }

    return NextResponse.json(subscription);
  } catch (error) {
    logger.error(
      "Failed to fetch subscription:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
