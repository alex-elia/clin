/** Resolve OpenAI-style chat completions URL from a configured API root. */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(root)) return root;
  if (/\/v1$/i.test(root)) return `${root}/chat/completions`;
  if (/openai_compat\/.+\/chat\/completions$/i.test(root)) return root;
  if (/openai_compat|\/api\//i.test(root)) {
    return `${root}/chat/completions`;
  }
  return `${root}/v1/chat/completions`;
}
