import OpenAI from "openai";
import { getOpenAIEnv } from "./env";

let client: OpenAI | null = null;

export function createOpenAIClient(): OpenAI {
  if (!client) {
    const { apiKey } = getOpenAIEnv();
    client = new OpenAI({ apiKey });
  }
  return client;
}
