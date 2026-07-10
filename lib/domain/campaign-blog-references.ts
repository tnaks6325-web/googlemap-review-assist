import { prisma } from "@/lib/db";
import { safeJsonSnapshot } from "@/lib/domain/external-places";
import { findNaverBlogReferences } from "@/lib/domain/naver-blog-search";

export interface AdminCampaignBlogReference {
  id: string;
  title: string;
  description: string | null;
  link: string;
  bloggerName: string | null;
  bloggerLink: string | null;
  postdate: string | null;
  publishedAt: string | null;
  searchQuery: string;
  status: string;
  createdAt: string;
}

export interface CampaignBlogReferenceCollectionResult {
  providerConfigured: boolean;
  queries: string[];
  imported: number;
  totalCount: number;
  references: AdminCampaignBlogReference[];
}

type CampaignBlogReferenceRecord = {
  id: string;
  title: string;
  description: string | null;
  link: string;
  bloggerName: string | null;
  bloggerLink: string | null;
  postdate: string | null;
  publishedAt: Date | null;
  searchQuery: string;
  status: string;
  createdAt: Date;
};

export function toAdminCampaignBlogReference(
  reference: CampaignBlogReferenceRecord,
): AdminCampaignBlogReference {
  return {
    id: reference.id,
    title: reference.title,
    description: reference.description,
    link: reference.link,
    bloggerName: reference.bloggerName,
    bloggerLink: reference.bloggerLink,
    postdate: reference.postdate,
    publishedAt: reference.publishedAt?.toISOString() ?? null,
    searchQuery: reference.searchQuery,
    status: reference.status,
    createdAt: reference.createdAt.toISOString(),
  };
}

export async function listCampaignBlogReferences(campaignId: string, take = 6) {
  const references = await prisma.campaignBlogReference.findMany({
    where: { campaignId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take,
  });
  return references.map(toAdminCampaignBlogReference);
}

export async function countCampaignBlogReferences(campaignId: string) {
  return prisma.campaignBlogReference.count({
    where: { campaignId, status: "ACTIVE" },
  });
}

export async function collectCampaignBlogReferences(
  campaignId: string,
): Promise<CampaignBlogReferenceCollectionResult | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      business: {
        include: {
          externalPlaces: {
            where: { platform: { in: ["GOOGLE", "NAVER"] } },
          },
        },
      },
    },
  });

  if (!campaign) return null;

  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
  const result = await findNaverBlogReferences(
    {
      businessName: campaign.business.name,
      googlePlaceName: googlePlace?.name,
      naverPlaceName: naverPlace?.name,
      address: naverPlace?.address ?? googlePlace?.address ?? campaign.business.address,
      category: naverPlace?.category ?? googlePlace?.category,
    },
    { maxResults: 10, displayPerQuery: 5 },
  );

  if (!result.providerConfigured) {
    return {
      providerConfigured: false,
      queries: result.queries,
      imported: 0,
      totalCount: await countCampaignBlogReferences(campaignId),
      references: await listCampaignBlogReferences(campaignId),
    };
  }

  let imported = 0;
  for (const reference of result.references) {
    await prisma.campaignBlogReference.upsert({
      where: {
        campaignId_link: {
          campaignId,
          link: reference.link,
        },
      },
      create: {
        campaignId,
        source: "NAVER_BLOG_SEARCH",
        searchQuery: reference.searchQuery,
        title: reference.title,
        description: reference.description,
        link: reference.link,
        bloggerName: reference.bloggerName,
        bloggerLink: reference.bloggerLink,
        postdate: reference.postdate,
        publishedAt: reference.publishedAt,
        rawJson: reference.rawJson,
        status: "ACTIVE",
      },
      update: {
        source: "NAVER_BLOG_SEARCH",
        searchQuery: reference.searchQuery,
        title: reference.title,
        description: reference.description,
        bloggerName: reference.bloggerName,
        bloggerLink: reference.bloggerLink,
        postdate: reference.postdate,
        publishedAt: reference.publishedAt,
        rawJson: safeJsonSnapshot({ refreshedAt: new Date().toISOString(), reference }),
        status: "ACTIVE",
      },
    });
    imported += 1;
  }

  return {
    providerConfigured: true,
    queries: result.queries,
    imported,
    totalCount: await countCampaignBlogReferences(campaignId),
    references: await listCampaignBlogReferences(campaignId),
  };
}
