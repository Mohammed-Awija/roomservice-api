import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkService } from '../auth/clerk.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
  ) {}

  /**
   * Find the user + their org by Clerk ID. If they don't exist yet
   * (first request after signup), create User + Organization + Membership.
   */
  async getOrProvision(clerkUserId: string) {
    // Already provisioned?
    const existing = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
      include: {
        memberships: {
          include: { organization: true },
        },
      },
    });

    if (existing) {
      return existing;
    }

    // Not provisioned — fetch details from Clerk and create everything
    const clerkUser = await this.clerk.client.users.getUser(clerkUserId);

    const email =
      clerkUser.emailAddresses[0]?.emailAddress ??
      `${clerkUserId}@unknown.local`;
    const firstName = clerkUser.firstName ?? null;
    const lastName = clerkUser.lastName ?? null;

    // Build a unique org slug from their name or email
    const baseSlug = (firstName || email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const slug = `${baseSlug}-${clerkUserId.slice(-6)}`;

    // Create everything in one transaction so it's all-or-nothing
    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          slug,
          name: firstName ? `${firstName}'s Property` : 'My Property',
          kind: 'HOTEL',
        },
      });

      const createdUser = await tx.user.create({
        data: {
          clerkId: clerkUserId,
          email,
          firstName,
          lastName,
          memberships: {
            create: {
              organizationId: org.id,
              role: 'OWNER',
            },
          },
        },
        include: {
          memberships: {
            include: { organization: true },
          },
        },
      });

      return createdUser;
    });

    return user;
  }
}
