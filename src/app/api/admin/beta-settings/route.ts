import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "BetaSettingsAPI";

export async function GET(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const settings = await prisma.$transaction(async (tx) => {
      const existingSettings = await tx.betaSettings.findFirst();

      if (existingSettings) {
        return existingSettings;
      } else {
        return tx.betaSettings.create({
          data: {
            id: "default",
          },
        });
      }
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error(
      "Failed to fetch beta settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch beta settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const updates = await request.json();

    // Validate autoInviteFrequency if provided
    if (
      updates.autoInviteFrequency &&
      !["DAILY", "WEEKLY", "MONTHLY"].includes(updates.autoInviteFrequency)
    ) {
      return NextResponse.json(
        { error: "autoInviteFrequency must be DAILY, WEEKLY, or MONTHLY" },
        { status: 400 }
      );
    }

    const settings = await prisma.$transaction(async (tx) => {
      const existingSettings = await tx.betaSettings.findFirst();

      if (existingSettings) {
        return tx.betaSettings.update({
          where: { id: existingSettings.id },
          data: updates,
        });
      } else {
        return tx.betaSettings.create({
          data: {
            id: "default",
            ...updates,
          },
        });
      }
    });

    logger.info("Beta settings updated", { updates: Object.keys(updates) }, LOG_SOURCE);

    return NextResponse.json(settings);
  } catch (error) {
    logger.error(
      "Failed to update beta settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update beta settings" },
      { status: 500 }
    );
  }
}
