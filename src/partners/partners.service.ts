import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type PublicPartnerDto = {
  id: string;
  name: string;
  href: string;
  mark: string;
  accent: string;
  logoUrl: string | null;
};

function markFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(): Promise<PublicPartnerDto[]> {
    const rows = await this.prisma.partner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        href: true,
        mark: true,
        accent: true,
        logoUrl: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      href: row.href,
      mark: row.mark.trim() || markFromName(row.name),
      accent: row.accent || '#157AFE',
      logoUrl: row.logoUrl,
    }));
  }
}
