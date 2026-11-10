export const BUBBLE_PROTOCOL = 1;
export const GAZE_TTL_MS = 300;

export type BubblePreferences = {
  enabled: boolean;
  diameter: number;
  brightness: number;
  smoothness: number;
};

export const DEFAULT_BUBBLE_PREFERENCES: BubblePreferences = {
  enabled: false,
  diameter: 44,
  brightness: 65,
  smoothness: 40
};

export type BubbleTrackerState =
  "not-requested" | "connecting" | "tracking" | "stale" | "unavailable" | "legacy-conflict";

export type BubbleSnapshot = {
  instanceId: string;
  revision: number;
  stateSequence: number;
  preferences: BubblePreferences;
  tracker: BubbleTrackerState;
  displayed: boolean;
  errorCode: string | null;
};

export type BubbleChange = {
  instanceId: string;
  revision: number;
  patch: Partial<BubblePreferences>;
};

export type BubbleResult = {
  ok: boolean;
  code?: string;
  state?: BubbleSnapshot;
};

export type BubbleFrame = {
  x: number;
  y: number;
  remainingMs: number;
  diameter: number;
  brightness: number;
} | null;

export function validPreferencePatch(value: unknown): value is Partial<BubblePreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(([key, item]) => {
      if (key === "enabled") return typeof item === "boolean";
      if (typeof item !== "number" || !Number.isInteger(item)) return false;
      if (key === "diameter") return item >= 20 && item <= 100;
      if (key === "brightness") return item >= 10 && item <= 100;
      if (key === "smoothness") return item >= 0 && item <= 100;
      return false;
    })
  );
}
