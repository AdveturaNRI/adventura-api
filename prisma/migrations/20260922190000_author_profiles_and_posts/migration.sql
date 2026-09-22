-- CreateTable
CREATE TABLE "author_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contacts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_posts" (
    "id" TEXT NOT NULL,
    "authorProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "isForSale" BOOLEAN NOT NULL DEFAULT false,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "purchaseDescription" TEXT,
    "purchaseUrl" TEXT,
    "filesMeta" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_post_likes" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_post_likes_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "author_profiles_userId_key" ON "author_profiles"("userId");

-- CreateIndex
CREATE INDEX "author_posts_authorProfileId_deletedAt_createdAt_idx" ON "author_posts"("authorProfileId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "author_posts_category_deletedAt_createdAt_idx" ON "author_posts"("category", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "author_posts_deletedAt_createdAt_idx" ON "author_posts"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "author_post_likes_userId_idx" ON "author_post_likes"("userId");

-- AddForeignKey
ALTER TABLE "author_profiles" ADD CONSTRAINT "author_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_posts" ADD CONSTRAINT "author_posts_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "author_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_post_likes" ADD CONSTRAINT "author_post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "author_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_post_likes" ADD CONSTRAINT "author_post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
