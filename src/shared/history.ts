import { z } from "zod";
import { SessionSourceTypeEnum } from "./session";

export const HistoryFilterSchema = z.object({
  range: z.enum(['all', 'week', 'month', 'year', 'custom']).default('all'),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  routine: z.string().uuid().optional(),
  program: z.string().uuid().optional(),
  exercise: z.string().uuid().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;

export const SessionSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  sourceType: SessionSourceTypeEnum,
  sourceRoutineId: z.string().uuid().nullable(),
  sourceRoutineName: z.string().nullable(),
  sourceProgramId: z.string().uuid().nullable(),
  sourceProgramName: z.string().nullable(),
  sourceProgramWeekIndex: z.number().int().nullable(),
  sourceProgramDayIndex: z.number().int().nullable(),
  startedAt: z.number().int(),
  endedAt: z.number().int(),
  exerciseCount: z.number().int(),
  setCount: z.number().int(),
  volumeKg: z.number(),
  durationMs: z.number().int(),
  hasPr: z.boolean(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const HistorySummarySchema = z.object({
  totalSessions: z.number().int(),
  totalVolumeKg: z.number(),
  totalSets: z.number().int(),
  totalExercises: z.number().int(),
  totalDurationMs: z.number().int(),
});
export type HistorySummary = z.infer<typeof HistorySummarySchema>;

export const HistorySessionsResponseSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  nextCursor: z.string().nullable(),
});
export type HistorySessionsResponse = z.infer<typeof HistorySessionsResponseSchema>;
