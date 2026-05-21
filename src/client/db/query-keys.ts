export const queryKeys = {
  exercises: {
    all: ["exercises"] as const,
    list: () => ["exercises", "list"] as const,
    byId: (id: string) => ["exercises", "byId", id] as const,
  },
  equipment: {
    all: ["equipment"] as const,
    list: () => ["equipment", "list"] as const,
    byId: (id: string) => ["equipment", "byId", id] as const,
    referenceCount: (id: string) => ["equipment", "referenceCount", id] as const,
  },
  routines: {
    all: ["routines"] as const,
    list: () => ["routines", "list"] as const,
    byId: (id: string) => ["routines", "byId", id] as const,
  },
  sessions: {
    all: ["sessions"] as const,
    list: () => ["sessions", "list"] as const,
    byId: (id: string) => ["sessions", "byId", id] as const,
    active: () => ["sessions", "active"] as const,
    logs: (sessionId: string) => ["sessions", "logs", sessionId] as const,
    allLogs: () => ["sessions", "allLogs"] as const,
  },
  history: {
    all: ["history"] as const,
    sessions: (filtersJson: string) => ["history", "sessions", filtersJson] as const,
    summary: (filtersJson: string) => ["history", "summary", filtersJson] as const,
  },
  exerciseHistory: {
    byExerciseId: (exerciseId: string) => ["exerciseHistory", exerciseId] as const,
    lastLog: (exerciseId: string) => ["exerciseHistory", "lastLog", exerciseId] as const,
  },
} as const;
