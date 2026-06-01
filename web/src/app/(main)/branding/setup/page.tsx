import { VoiceSetupWizard } from "@/components/VoiceSetupWizard";
import { getDb } from "@/db";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { contactPickerLabel } from "@/lib/contactDisplay";
import { getOrCreateUserContext } from "@/lib/userContext";
import { getContactById, listContacts } from "@/lib/queries";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";
import { getSelfProfileReadyForOllama } from "@/lib/userProfileLlm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function VoiceSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const status = await getVoiceSetupStatus();
  const sp = await searchParams;
  if (status.complete && sp.edit !== "1") {
    redirect("/branding/calendar");
  }

  const ctx = await getOrCreateUserContext();
  const brand = await getOrCreateContentBrandContext();
  let contacts = await listContacts({ limit: 100 });
  if (ctx.selfContactId) {
    const self = await getContactById(ctx.selfContactId);
    if (self) {
      contacts = [self, ...contacts.filter((c) => c.id !== self.id)];
    }
  }

  const rhythm = brand.publishingRhythm;
  const rhythmWeekdaysDefault =
    rhythm?.preferredWeekdays?.length
      ? rhythm.preferredWeekdays.join(",")
      : "2,4";
  const rhythmTimeDefault = rhythm?.timeWindow?.trim() || "08:45-09:15";

  let profileReady = false;
  if (ctx.selfContactId) {
    const gate = await getSelfProfileReadyForOllama(getDb(), ctx.selfContactId);
    profileReady = gate.ok;
  }

  return (
    <VoiceSetupWizard
      contacts={contacts.map((c) => ({
        id: c.id,
        label: contactPickerLabel(c),
      }))}
      selfContactId={ctx.selfContactId}
      goalsDefault={ctx.goalsText ?? ""}
      positioningDefault={ctx.positioningSummary ?? ""}
      doctrineDefault={brand.contentDoctrine ?? ""}
      expertiseDefault={brand.expertiseSummary ?? ""}
      rhythmWeekdaysDefault={rhythmWeekdaysDefault}
      rhythmTimeDefault={rhythmTimeDefault}
      contentLanguageDefault={brand.contentLanguage ?? "auto"}
      profileReady={profileReady}
    />
  );
}
