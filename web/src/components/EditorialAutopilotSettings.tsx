import { EditorialAutopilotClient } from "@/components/EditorialAutopilotClient";
import type { ContentBrandContextRow } from "@/lib/contentBrandContext";
import { getRecentEditorialJobs } from "@/lib/editorial/editorialJobs";
import { listContentSources } from "@/lib/sources/contentSources";

export async function EditorialAutopilotSettings({
  brand,
}: {
  brand: ContentBrandContextRow;
}) {
  const [jobs, sources] = await Promise.all([
    getRecentEditorialJobs(8),
    listContentSources(),
  ]);

  return (
    <EditorialAutopilotClient
      brand={{
        marketRegion: brand.marketRegion,
        planningHorizonDays: brand.planningHorizonDays,
        editorialAutopilotEnabled: brand.editorialAutopilotEnabled,
        editorialAutopilotPolicy: brand.editorialAutopilotPolicy,
      }}
      sourceCount={sources.length}
      tavilyConfigured={Boolean(process.env.TAVILY_API_KEY?.trim())}
      jobs={jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        lastError: j.lastError,
      }))}
    />
  );
}
