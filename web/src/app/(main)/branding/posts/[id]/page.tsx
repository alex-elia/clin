import { notFound, redirect } from "next/navigation";
import { ContentPostWorkspace } from "@/components/ContentPostWorkspace";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { getContentPostById } from "@/lib/contentPosts";
import { getSdSettings } from "@/lib/sdSettings";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";

export const dynamic = "force-dynamic";

export default async function ContentPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const setup = await getVoiceSetupStatus();
  if (!setup.complete) {
    redirect("/branding/setup");
  }

  const { id } = await params;
  const [post, sd, brand] = await Promise.all([
    getContentPostById(id),
    getSdSettings(),
    getOrCreateContentBrandContext(),
  ]);
  if (!post) notFound();
  return (
    <ContentPostWorkspace
      post={post}
      sdEnabled={sd.enabled}
      brandContentLanguage={brand.contentLanguage}
    />
  );
}
