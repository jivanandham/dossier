-- AlterEnum
-- WTTJ was added to the schema without a migration; IF NOT EXISTS covers
-- databases that already have it (from `prisma db push`) and those that don't.
ALTER TYPE "PostingSource" ADD VALUE IF NOT EXISTS 'WTTJ';
ALTER TYPE "PostingSource" ADD VALUE IF NOT EXISTS 'FRANCETRAVAIL';
