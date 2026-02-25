import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminSubscriptionIdAPI";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(subscription);
  } catch (error) {
    logger.error(
      "Failed to get subscription:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to get subscription" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;
    const body = await request.json();
    const { plan, status } = body;

    // Validate plan if provided
    if (plan && !["FREE", "LIFETIME"].includes(plan)) {
      return NextResponse.json(
        { error: "Plan must be FREE or LIFETIME" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (
      status &&
      !["ACTIVE", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(status)
    ) {
      return NextResponse.json(
        { error: "Status must be ACTIVE, PAYMENT_PENDING, or PAYMENT_FAILED" },
        { status: 400 }
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    const updatedSubscription = await prisma.subscription.update({
      where: { id },
      data: {
        ...(plan !== undefined && { plan }),
        ...(status !== undefined && { status }),
      },
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

    logger.info(
      `Admin updated subscription ${id}`,
      { updates: Object.keys(body) },
      LOG_SOURCE
    );

    return NextResponse.json(updatedSubscription);
  } catch (error) {
    logger.error(
      "Failed to update subscription:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
