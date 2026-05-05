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
} as const;
