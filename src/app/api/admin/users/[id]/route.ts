import { NextRequest, NextResponse } from "next/server";

import { getToken } from "next-auth/jwt";

import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminUserAPI";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            amount: true,
            discountApplied: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            tasks: true,
            projects: true,
            connectedAccounts: true,
            tags: true,
            taskProviders: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    logger.error(
      "Failed to get user:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to get user" },
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
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const { id } = await params;
    const body = await request.json();
    const { name, email, role } = body;

    // Validate role if provided
    if (role && !["user", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'user' or 'admin'" },
        { status: 400 }
      );
    }

    // Prevent admin from demoting themselves
    if (role && role !== "admin" && token?.sub === id) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    logger.info(
      `Admin updated user ${id}`,
      { updates: Object.keys(body) },
      LOG_SOURCE
    );

    return NextResponse.json(updatedUser);
  } catch (error) {
    logger.error(
      "Failed to update user:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update user" },
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
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const { id } = await params;

    // Prevent admin from deleting themselves
    if (token?.sub === id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete in a transaction - handle non-cascading relations first
    await prisma.$transaction(async (tx) => {
      // Delete calendar events via feeds
      await tx.calendarEvent.deleteMany({
        where: { feed: { userId: id } },
      });

      // Delete calendar feeds
      await tx.calendarFeed.deleteMany({ where: { userId: id } });

      // Delete connected accounts
      await tx.connectedAccount.deleteMany({ where: { userId: id } });

      // Delete tasks
      await tx.task.deleteMany({ where: { userId: id } });

      // Delete projects
      await tx.project.deleteMany({ where: { userId: id } });

      // Delete tags
      await tx.tag.deleteMany({ where: { userId: id } });

      // Delete task changes
      await tx.taskChange.deleteMany({ where: { userId: id } });

      // Delete job records
      await tx.jobRecord.deleteMany({ where: { userId: id } });

      // Delete task providers (cascades to mappings)
      await tx.taskProvider.deleteMany({ where: { userId: id } });

      // Finally delete the user (cascades to accounts, sessions, settings, etc.)
      await tx.user.delete({ where: { id } });
    });

    logger.info(`Admin deleted user ${id}`, {}, LOG_SOURCE);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete user:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
