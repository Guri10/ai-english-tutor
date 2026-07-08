export type OpenAIEnv = {
  apiKey: string;
};

export function getOpenAIEnv(): OpenAIEnv {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing required env var: OPENAI_API_KEY");
  }

  return { apiKey };
}
