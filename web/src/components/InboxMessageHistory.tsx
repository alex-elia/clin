import type { MessagingMessageRow } from "@/lib/messagingContext";

export function InboxMessageHistory({
  messages,
  defaultOpen = false,
}: {
  messages: MessagingMessageRow[];
  defaultOpen?: boolean;
}) {
  if (!messages.length) return null;

  const tail = messages.slice(-12);

  return (
    <details className="mt-3" open={defaultOpen}>
      <summary className="cursor-pointer text-xs font-medium text-clin-muted">
        Message history ({messages.length})
      </summary>
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {tail.map((m, i) => (
          <li
            key={`${m.from}-${i}-${m.body.slice(0, 40)}`}
            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
              m.from === "me"
                ? "ml-6 bg-sky-50/80 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"
                : m.from === "them"
                  ? "mr-6 bg-clin-surface-muted text-clin-text"
                  : "bg-clin-surface-muted/60 text-clin-muted"
            }`}
          >
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {m.from === "me" ? "You" : m.from === "them" ? "Them" : "Unknown"}
            </span>
            <span className="whitespace-pre-wrap">{m.body}</span>
          </li>
        ))}
        {messages.length > tail.length ? (
          <li className="text-center text-[11px] text-clin-muted">
            +{messages.length - tail.length} earlier messages (merged from captures)
          </li>
        ) : null}
      </ul>
    </details>
  );
}
