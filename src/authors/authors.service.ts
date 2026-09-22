import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ImageProcessorService } from '../image/image-processor.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import { CreateAuthorPostDto } from './dto/create-author-post.dto';
import { UpdateAuthorPostDto } from './dto/update-author-post.dto';
import { UpdateAuthorProfileDto } from './dto/update-author-profile.dto';
import type {
  AuthorContactDto,
  AuthorDto,
  AuthorFileMeta,
  AuthorPostDto,
  AuthorPostFileDto,
  CreativityCategory,
} from './types/author.type';
import {
  AUTHOR_CONTACT_TYPES,
  CREATIVITY_CATEGORIES,
} from './types/author.type';

const USER_ENTITY_TYPE = 'User';
const AVATAR_COLLECTION = 'avatar';
const PROFILE_CARD_COLLECTION = 'profileCard';
const POST_ENTITY_TYPE = 'author_post';
const MAX_IMAGES = 8;
const MAX_FILES = 8;

type ProfileWithUser = {
  id: string;
  userId: string;
  description: string;
  categories: string[];
  contacts: Prisma.JsonValue | null;
  user: { id: string; nickname: string };
  posts: { id: string }[];
};

type PostRow = {
  id: string;
  authorProfileId: string;
  title: string;
  content: string;
  category: string;
  views: number;
  likesCount: number;
  isForSale: boolean;
  price: number | null;
  currency: string | null;
  purchaseDescription: string | null;
  purchaseUrl: string | null;
  filesMeta: Prisma.JsonValue | null;
  createdAt: Date;
  authorProfile: { userId: string };
};

@Injectable()
export class AuthorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly rewardsService: RewardsService,
  ) {}

  async listAuthors(viewerId: string): Promise<AuthorDto[]> {
    const profiles = await this.prisma.authorProfile.findMany({
      include: {
        user: { select: { id: true, nickname: true } },
        posts: {
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(profiles.map((profile) => this.toAuthorDto(profile)));
  }

  async getMe(userId: string): Promise<AuthorDto> {
    const profile = await this.ensureProfile(userId);
    return this.toAuthorDto(profile);
  }

  async getAuthor(viewerId: string, authorUserId: string): Promise<AuthorDto> {
    const profile = await this.prisma.authorProfile.findUnique({
      where: { userId: authorUserId },
      include: {
        user: { select: { id: true, nickname: true } },
        posts: {
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Автор не найден');
    }
    return this.toAuthorDto(profile);
  }

  async updateMe(userId: string, dto: UpdateAuthorProfileDto): Promise<AuthorDto> {
    const categories = this.normalizeCategories(dto.categories);
    if (categories.length === 0) {
      throw new BadRequestException('Выберите хотя бы одну категорию');
    }

    const contacts = this.normalizeContacts(dto.contacts);
    await this.ensureProfile(userId);

    const profile = await this.prisma.authorProfile.update({
      where: { userId },
      data: {
        description: dto.description.trim(),
        categories,
        contacts,
      },
      include: {
        user: { select: { id: true, nickname: true } },
        posts: {
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return this.toAuthorDto(profile);
  }

  async listPosts(
    viewerId: string,
    category?: string,
  ): Promise<AuthorPostDto[]> {
    const where: Prisma.AuthorPostWhereInput = { deletedAt: null };
    if (category && category !== 'all') {
      if (!CREATIVITY_CATEGORIES.includes(category as CreativityCategory)) {
        throw new BadRequestException('Неизвестный фильтр категории');
      }
      where.category = category;
    }

    const posts = await this.prisma.authorPost.findMany({
      where,
      include: { authorProfile: { select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const likedIds = await this.getLikedPostIds(
      viewerId,
      posts.map((post) => post.id),
    );

    return Promise.all(
      posts.map((post) => this.toPostDto(post, likedIds.has(post.id))),
    );
  }

  async listAuthorPosts(
    viewerId: string,
    authorUserId: string,
  ): Promise<AuthorPostDto[]> {
    const profile = await this.prisma.authorProfile.findUnique({
      where: { userId: authorUserId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Автор не найден');
    }

    const posts = await this.prisma.authorPost.findMany({
      where: { authorProfileId: profile.id, deletedAt: null },
      include: { authorProfile: { select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const likedIds = await this.getLikedPostIds(
      viewerId,
      posts.map((post) => post.id),
    );

    return Promise.all(
      posts.map((post) => this.toPostDto(post, likedIds.has(post.id))),
    );
  }

  async getPost(viewerId: string, postId: string): Promise<AuthorPostDto> {
    const post = await this.requirePost(postId);
    const liked = await this.prisma.authorPostLike.findUnique({
      where: { postId_userId: { postId, userId: viewerId } },
      select: { postId: true },
    });
    return this.toPostDto(post, Boolean(liked));
  }

  async createPost(userId: string, dto: CreateAuthorPostDto): Promise<AuthorPostDto> {
    const profile = await this.ensureProfile(userId);
    this.assertSaleFields(dto);

    const post = await this.prisma.authorPost.create({
      data: {
        authorProfileId: profile.id,
        title: dto.title.trim(),
        content: dto.content ?? '',
        category: dto.category,
        isForSale: dto.isForSale,
        price: dto.isForSale ? dto.price ?? null : null,
        currency: dto.isForSale ? dto.currency?.trim() || '₽' : null,
        purchaseDescription: dto.isForSale
          ? dto.purchaseDescription?.trim() || null
          : null,
        purchaseUrl: dto.isForSale ? dto.purchaseUrl?.trim() || null : null,
        filesMeta: [],
      },
      include: { authorProfile: { select: { userId: true } } },
    });

    return this.toPostDto(post, false);
  }

  async updatePost(
    userId: string,
    postId: string,
    dto: UpdateAuthorPostDto,
  ): Promise<AuthorPostDto> {
    const post = await this.requireOwnedPost(userId, postId);
    this.assertSaleFields(dto);

    const updated = await this.prisma.authorPost.update({
      where: { id: post.id },
      data: {
        title: dto.title.trim(),
        content: dto.content ?? '',
        category: dto.category,
        isForSale: dto.isForSale,
        price: dto.isForSale ? dto.price ?? null : null,
        currency: dto.isForSale ? dto.currency?.trim() || '₽' : null,
        purchaseDescription: dto.isForSale
          ? dto.purchaseDescription?.trim() || null
          : null,
        purchaseUrl: dto.isForSale ? dto.purchaseUrl?.trim() || null : null,
      },
      include: { authorProfile: { select: { userId: true } } },
    });

    const liked = await this.prisma.authorPostLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { postId: true },
    });

    return this.toPostDto(updated, Boolean(liked));
  }

  async deletePost(userId: string, postId: string): Promise<{ ok: true }> {
    const post = await this.requireOwnedPost(userId, postId);
    await this.prisma.authorPost.update({
      where: { id: post.id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async toggleLike(
    userId: string,
    postId: string,
  ): Promise<{ liked: boolean; likes: number }> {
    await this.requirePost(postId);

    const existing = await this.prisma.authorPostLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.authorPostLike.delete({
          where: { postId_userId: { postId, userId } },
        }),
        this.prisma.authorPost.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        }),
      ]);
      return { liked: false, likes: Math.max(0, updated.likesCount) };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.authorPostLike.create({
        data: { postId, userId },
      }),
      this.prisma.authorPost.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      }),
    ]);

    return { liked: true, likes: updated.likesCount };
  }

  async incrementViews(postId: string): Promise<{ views: number }> {
    await this.requirePost(postId);
    const updated = await this.prisma.authorPost.update({
      where: { id: postId },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return { views: updated.views };
  }

  async uploadImages(
    userId: string,
    postId: string,
    files: Express.Multer.File[],
  ): Promise<AuthorPostDto> {
    await this.requireOwnedPost(userId, postId);
    if (files.length > MAX_IMAGES) {
      throw new BadRequestException(`Максимум ${MAX_IMAGES} изображений`);
    }

    await this.clearImageCollections(postId);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const variants = await this.imageProcessor.processImage(
        file.buffer,
        file.mimetype,
        ['cardThumb', 'card', 'original'],
      );
      await this.mediaService.replaceCollection(
        {
          entityType: POST_ENTITY_TYPE,
          entityId: postId,
          collection: `image-${index}`,
        },
        variants,
      );
    }

    return this.getPost(userId, postId);
  }

  async uploadFiles(
    userId: string,
    postId: string,
    files: Express.Multer.File[],
  ): Promise<AuthorPostDto> {
    await this.requireOwnedPost(userId, postId);
    if (files.length > MAX_FILES) {
      throw new BadRequestException(`Максимум ${MAX_FILES} файлов`);
    }

    await this.clearFileCollections(postId, this.parseFilesMeta(null));

    const meta: AuthorFileMeta[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      await this.mediaService.saveRawFile(
        {
          entityType: POST_ENTITY_TYPE,
          entityId: postId,
          collection: `file-${index}`,
        },
        file.buffer,
        file.mimetype || 'application/octet-stream',
        {
          fileName: file.originalname,
        },
      );
      meta.push({
        id: `file-${index}`,
        name: file.originalname || `file-${index}`,
        size: file.size,
        type: file.mimetype || 'application/octet-stream',
        index,
      });
    }

    await this.prisma.authorPost.update({
      where: { id: postId },
      data: { filesMeta: meta },
    });

    return this.getPost(userId, postId);
  }

  private async ensureProfile(userId: string): Promise<ProfileWithUser> {
    const existing = await this.prisma.authorProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, nickname: true } },
        posts: {
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.authorProfile.create({
      data: {
        userId,
        description: '',
        categories: ['other'],
        contacts: [],
      },
      include: {
        user: { select: { id: true, nickname: true } },
        posts: {
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  private async requirePost(postId: string): Promise<PostRow> {
    const post = await this.prisma.authorPost.findFirst({
      where: { id: postId, deletedAt: null },
      include: { authorProfile: { select: { userId: true } } },
    });
    if (!post) {
      throw new NotFoundException('Публикация не найдена');
    }
    return post;
  }

  private async requireOwnedPost(userId: string, postId: string): Promise<PostRow> {
    const post = await this.requirePost(postId);
    if (post.authorProfile.userId !== userId) {
      throw new NotFoundException('Публикация не найдена');
    }
    return post;
  }

  private assertSaleFields(dto: CreateAuthorPostDto | UpdateAuthorPostDto) {
    if (!dto.isForSale) {
      return;
    }
    if (dto.price == null || !Number.isFinite(dto.price) || dto.price <= 0) {
      throw new BadRequestException('Укажите цену');
    }
    if (!dto.purchaseUrl?.trim()) {
      throw new BadRequestException('Укажите ссылку для покупки');
    }
  }

  private normalizeCategories(raw: string[]): CreativityCategory[] {
    const unique = [...new Set(raw)];
    return unique.filter((item): item is CreativityCategory =>
      CREATIVITY_CATEGORIES.includes(item as CreativityCategory),
    );
  }

  private normalizeContacts(
    raw: UpdateAuthorProfileDto['contacts'],
  ): AuthorContactDto[] {
    return raw.map((contact) => ({
      type: contact.type,
      label: contact.label.trim(),
      url: contact.url.trim(),
    }));
  }

  private parseContacts(value: Prisma.JsonValue | null): AuthorContactDto[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const result: AuthorContactDto[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const type = String(row.type ?? '');
      const label = String(row.label ?? '').trim();
      const url = String(row.url ?? '').trim();
      if (
        !AUTHOR_CONTACT_TYPES.includes(type as (typeof AUTHOR_CONTACT_TYPES)[number]) ||
        !label ||
        !url
      ) {
        continue;
      }
      result.push({
        type: type as AuthorContactDto['type'],
        label,
        url,
      });
    }
    return result;
  }

  private parseFilesMeta(value: Prisma.JsonValue | null): AuthorFileMeta[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const index = Number(row.index);
        if (!Number.isFinite(index)) return null;
        return {
          id: String(row.id ?? `file-${index}`),
          name: String(row.name ?? `file-${index}`),
          size: Number(row.size ?? 0),
          type: String(row.type ?? 'application/octet-stream'),
          index,
        } satisfies AuthorFileMeta;
      })
      .filter((item): item is AuthorFileMeta => item != null);
  }

  private async getLikedPostIds(
    viewerId: string,
    postIds: string[],
  ): Promise<Set<string>> {
    if (postIds.length === 0) {
      return new Set();
    }
    const likes = await this.prisma.authorPostLike.findMany({
      where: { userId: viewerId, postId: { in: postIds } },
      select: { postId: true },
    });
    return new Set(likes.map((item) => item.postId));
  }

  private async getAvatarUrl(userId: string): Promise<string> {
    const avatarMedia = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: AVATAR_COLLECTION,
    });
    const avatarUrls = await this.mediaService.getCollectionUrls(avatarMedia);
    const round =
      avatarUrls.large ??
      avatarUrls.medium ??
      avatarUrls.small ??
      avatarUrls.thumb ??
      null;
    if (round) {
      return round;
    }

    const cardMedia = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: PROFILE_CARD_COLLECTION,
    });
    const cardUrls = await this.mediaService.getCollectionUrls(cardMedia);
    return (
      cardUrls.card ??
      cardUrls.cardThumb ??
      cardUrls.large ??
      cardUrls.original ??
      ''
    );
  }

  private async resolveImageUrls(postId: string): Promise<string[]> {
    const urls: string[] = [];
    for (let index = 0; index < MAX_IMAGES; index += 1) {
      const media = await this.mediaService.getCollection({
        entityType: POST_ENTITY_TYPE,
        entityId: postId,
        collection: `image-${index}`,
      });
      if (media.length === 0) {
        break;
      }
      const variants = await this.mediaService.getCollectionUrls(media);
      const url =
        variants.card ??
        variants.original ??
        variants.cardThumb ??
        variants.medium ??
        variants.large ??
        null;
      if (url) {
        urls.push(url);
      }
    }
    return urls;
  }

  private async resolveFiles(
    postId: string,
    meta: AuthorFileMeta[],
  ): Promise<AuthorPostFileDto[]> {
    const files: AuthorPostFileDto[] = [];
    for (const item of meta) {
      const media = await this.mediaService.getCollection({
        entityType: POST_ENTITY_TYPE,
        entityId: postId,
        collection: `file-${item.index}`,
      });
      const fileMedia = media[0];
      if (!fileMedia) continue;
      const url = await this.mediaService.getPublicUrl(fileMedia);
      files.push({
        id: item.id,
        name: item.name,
        size: item.size || fileMedia.size,
        type: item.type || fileMedia.mimeType,
        url,
      });
    }
    return files;
  }

  private async clearImageCollections(postId: string) {
    for (let index = 0; index < MAX_IMAGES; index += 1) {
      await this.mediaService.deleteCollection({
        entityType: POST_ENTITY_TYPE,
        entityId: postId,
        collection: `image-${index}`,
      });
    }
  }

  private async clearFileCollections(postId: string, meta: AuthorFileMeta[]) {
    const maxIndex = Math.max(MAX_FILES, ...meta.map((item) => item.index + 1), 0);
    for (let index = 0; index < maxIndex; index += 1) {
      await this.mediaService.deleteCollection({
        entityType: POST_ENTITY_TYPE,
        entityId: postId,
        collection: `file-${index}`,
      });
    }
  }

  private async toAuthorDto(profile: ProfileWithUser): Promise<AuthorDto> {
    const categories = this.normalizeCategories(profile.categories);
    const [avatar, rewards] = await Promise.all([
      this.getAvatarUrl(profile.userId),
      this.rewardsService.getMyRewards(profile.userId),
    ]);

    return {
      id: profile.userId,
      name: profile.user.nickname,
      avatar,
      badges: rewards.perks.visibleBadges,
      avatarFrameId: rewards.perks.avatarFrameId,
      categories: categories.length > 0 ? categories : ['other'],
      description: profile.description,
      contacts: this.parseContacts(profile.contacts),
      postIds: profile.posts.map((post) => post.id),
    };
  }

  private async toPostDto(post: PostRow, liked: boolean): Promise<AuthorPostDto> {
    const category = CREATIVITY_CATEGORIES.includes(
      post.category as CreativityCategory,
    )
      ? (post.category as CreativityCategory)
      : 'other';
    const filesMeta = this.parseFilesMeta(post.filesMeta);
    const [images, files] = await Promise.all([
      this.resolveImageUrls(post.id),
      this.resolveFiles(post.id, filesMeta),
    ]);

    return {
      id: post.id,
      authorId: post.authorProfile.userId,
      title: post.title,
      content: post.content,
      category,
      images,
      files,
      createdAt: post.createdAt.toISOString(),
      views: post.views,
      likes: Math.max(0, post.likesCount),
      liked,
      isForSale: post.isForSale,
      price: post.price ?? undefined,
      currency: post.currency ?? undefined,
      purchaseDescription: post.purchaseDescription ?? undefined,
      purchaseUrl: post.purchaseUrl ?? undefined,
    };
  }
}
