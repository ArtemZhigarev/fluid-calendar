import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminWaitlistAPI";

export async function GET(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [entries, total, stats] = await Promise.all([
      prisma.waitlist.findMany({
        where,
        orderBy: { priorityScore: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.waitlist.count({ where }),
      Promise.all([
        prisma.waitlist.count({ where: { status: "WAITING" } }),
        prisma.waitlist.count({ where: { status: "INVITED" } }),
        prisma.waitlist.count({ where: { status: "REGISTERED" } }),
      ]),
    ]);

    return NextResponse.json({
      entries,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
      stats: {
        totalWaiting: stats[0],
        totalInvited: stats[1],
        totalRegistered: stats[2],
      },
    });
  } catch (error) {
    logger.error(
      "Failed to list waitlist:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list waitlist entries" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { email, name } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Check if already on waitlist
    const existing = await prisma.waitlist.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email is already on the waitlist" },
        { status: 409 }
      );
    }

    // Generate a unique referral code
    const referralCode = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const entry = await prisma.waitlist.create({
      data: {
        email,
        name,
        referralCode,
        status: "WAITING",
      },
    });

    logger.info(`Admin added ${email} to waitlist`, { email }, LOG_SOURCE);

    return NextResponse.json(entry);
  } catch (error) {
    logger.error(
      "Failed to add to waitlist:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to add to waitlist" },
      { status: 500 }
    );
  }
}
