import { z } from "zod";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export const sessionSummarySchema = z.object({
  levelScore: z.enum(CEFR_LEVELS),
  topicsCovered: z.array(z.string()),
  mistakes: z.array(
    z.object({
      type: z.string(),
      example: z.string(),
      correction: z.string(),
    })
  ),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
