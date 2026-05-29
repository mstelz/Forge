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
  programs: {
    all: ["programs"] as const,
    list: () => ["programs", "list"] as const,
    byId: (id: string) => ["programs", "byId", id] as const,
  },
  programRuns: {
    all: ["programRuns"] as const,
    list: () => ["programRuns", "list"] as const,
    byId: (id: string) => ["programRuns", "byId", id] as const,
    activeForProgram: (programId: string) => ["programRuns", "active", programId] as const,
    globallyActive: () => ["programRuns", "globallyActive"] as const,
    activeList: () => ["programRuns", "activeList"] as const,
    finishedForProgram: (programId: string) => ["programRuns", "finished", programId] as const,
  },
  goals: {
    all: ["goals"] as const,
    list: () => ["goals", "list"] as const,
    byId: (id: string) => ["goals", "byId", id] as const,
  },
  settings: {
    all: ["settings"] as const,
    singleton: () => ["settings", "singleton"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    list: () => ["profiles", "list"] as const,
    byId: (id: string) => ["profiles", "byId", id] as const,
  },
  weightLogs: {
    all: ["weightLogs"] as const,
    byProfileId: (profileId: string) => ["weightLogs", "byProfileId", profileId] as const,
  },
} as const;
