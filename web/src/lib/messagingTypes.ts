/** Client-safe messaging types — no DB imports. */

export type MessagingMessageRow = {
  from: "me" | "them" | "unknown";
  body: string;
};

export type ThreadReplyState = {
  lastFrom: "me" | "them" | "unknown" | null;
  needsReply: boolean;
  lastPreview: string;
  theirMessageCount: number;
  myMessageCount: number;
};

export type MergedMessagingThread = {
  contactId: string;
  threadKey: string;
  threadUrl: string;
  messages: MessagingMessageRow[];
  messageCount: number;
  text: string;
  firstCapturedAt: Date | null;
  lastCapturedAt: Date | null;
  captureCount: number;
  replyState: ThreadReplyState;
};
