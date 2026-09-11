import { notFound, redirect } from "next/navigation";
import { ContentPostWorkspace } from "@/components/ContentPostWorkspace";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { loadLatestCoachThreadForUi } from "@/lib/contentCoachThreads";
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
  const [post, sd, brand, coachHistory] = await Promise.all([
    getContentPostById(id),
    getSdSettings(),
    getOrCreateContentBrandContext(),
    loadLatestCoachThreadForUi({ scope: "post", postId: id, limit: 40 }),
  ]);
  if (!post) notFound();
  return (
    <ContentPostWorkspace
      post={post}
      sdEnabled={sd.enabled}
      brandContentLanguage={brand.contentLanguage}
      unicodeEmphasis={
        brand.editorialAutopilotPolicy?.useUnicodeEmphasis !== false
      }
      coachThreadId={coachHistory.threadId}
      coachMessages={coachHistory.messages.slice(-24)}
    />
  );
}
