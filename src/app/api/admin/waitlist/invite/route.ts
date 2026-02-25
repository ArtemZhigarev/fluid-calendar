import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminWaitlistInviteAPI";

export async function POST(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { waitlistId, waitlistIds } = body;

    // Support single or batch invites
    const ids: string[] = waitlistIds || (waitlistId ? [waitlistId] : []);

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "waitlistId or waitlistIds is required" },
        { status: 400 }
      );
    }

    // Get beta settings for invitation expiry
    const betaSettings = await prisma.betaSettings.findFirst();
    const invitationValidDays = betaSettings?.invitationValidDays || 7;

    const now = newDate();
    const invitationExpiry = new Date(now);
    invitationExpiry.setDate(invitationExpiry.getDate() + invitationValidDays);

    let invited = 0;
    const errors: string[] = [];

    for (const id of ids) {
      const entry = await prisma.waitlist.findUnique({ where: { id } });

      if (!entry) {
        errors.push(`Entry ${id} not found`);
        continue;
      }

      if (entry.status !== "WAITING") {
        errors.push(`Entry ${id} (${entry.email}) is already ${entry.status}`);
        continue;
      }

      // Generate invitation token
      const invitationToken = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;

      await prisma.waitlist.update({
        where: { id },
        data: {
          status: "INVITED",
          invitedAt: now,
          invitationToken,
          invitationExpiry,
        },
      });

      invited++;

      logger.info(
        `Invited ${entry.email} from waitlist`,
        { waitlistId: id, email: entry.email },
        LOG_SOURCE
      );
    }

    return NextResponse.json({
      success: true,
      invited,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    logger.error(
      "Failed to send waitlist invitations:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to send waitlist invitations" },
      { status: 500 }
    );
  }
}
