import { redirect } from "next/navigation";
import { createContentPostAction } from "@/app/actions";
import Link from "next/link";
import { VoiceNoteTextarea } from "@/components/VoiceNoteTextarea";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";

export const dynamic = "force-dynamic";

export default async function NewContentPostPage() {
  const setup = await getVoiceSetupStatus();
  if (!setup.complete) {
    redirect("/branding/setup");
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/branding/calendar" className="clin-link text-sm">
        ← Content plan
      </Link>
      <h1 className="clin-page-title">New post</h1>
      <p className="text-sm text-[var(--clin-muted)]">
        Create a shell, then use the writing assistant on the next screen.
      </p>
      <form action={createContentPostAction} className="clin-card space-y-4 p-5">
        <label className="block text-sm">
          <span className="font-medium">Working title</span>
          <input name="title" className="clin-input mt-1" placeholder="e.g. IA & écoute — Dalaï-Lama" />
        </label>
        <VoiceNoteTextarea
          name="ideaNotes"
          rows={5}
          placeholder="Speak or paste voice note or bullets…"
          label={<span className="font-medium">Brief (optional)</span>}
        />
        <button type="submit" className="clin-btn-primary w-full">
          Create &amp; open writing assistant
        </button>
      </form>
    </div>
  );
}
