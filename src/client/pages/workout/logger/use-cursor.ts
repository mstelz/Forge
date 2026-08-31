import { useEffect, useMemo, useRef, useState } from "react";
import { deriveCursor } from "./structure";
import type { SessionSetLog } from "../../../../shared";
import type { CursorPos, LiveStructure } from "./types";

/**
 * Two cursors, deliberately. `cursor` is derived from the logs — the next set the
 * plan says to do. `selectedPos` is the row the user tapped, which wins while it
 * is set so they can go back and edit an earlier set. Logging a set moves the
 * derived cursor, and that move re-syncs the selection to follow along.
 */
export function useCursor(liveStructure: LiveStructure, logs: SessionSetLog[]) {
  const cursor = useMemo(
    () => deriveCursor(liveStructure, logs),
    [liveStructure, logs],
  );

  const [selectedPos, setSelectedPos] = useState<CursorPos | null>(null);

  const prevCursorRef = useRef<CursorPos | null>(null);
  useEffect(() => {
    if (cursor === null) {
      setSelectedPos(null);
      prevCursorRef.current = null;
      return;
    }
    const prev = prevCursorRef.current;
    const moved =
      prev === null ||
      cursor.blockIdx !== prev.blockIdx ||
      cursor.itemIdx !== prev.itemIdx ||
      cursor.slotIdx !== prev.slotIdx;
    if (moved) {
      setSelectedPos(cursor);
    }
    prevCursorRef.current = cursor;
  }, [cursor]);

  return { cursor, selectedPos, setSelectedPos, activeCursor: selectedPos ?? cursor };
}
