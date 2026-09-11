import Link from "next/link";
import { createCampaignAction } from "@/app/actions";
import { CampaignFormFields } from "@/components/CampaignFormFields";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const err = sp.err === "missing";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/outreach" className="clin-link text-sm">
          ← Outreach
        </Link>
        <Link href="/campaigns" className="clin-link ml-3 text-sm">
          Campaigns
        </Link>
        <h1 className="mt-4 clin-page-title">New campaign</h1>
        <p className="mt-1 text-sm text-clin-muted">
          <strong className="font-medium">Context</strong> is the pitch the model
          sees for every contact. <strong className="font-medium">Writer instructions</strong>{" "}
          refine tone and rules per draft.
        </p>
      </div>

      <form action={createCampaignAction} className="space-y-4">
        <CampaignFormFields submitLabel="Create" err={err} />
      </form>
    </div>
  );
}
