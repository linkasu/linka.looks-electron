import { randomUUID } from "node:crypto";
import {
  DEFAULT_BUBBLE_PREFERENCES,
  validPreferencePatch,
  type BubbleChange,
  type BubblePreferences,
  type BubbleResult,
  type BubbleSnapshot,
  type BubbleTrackerState
} from "../../common/bubble/contract";

export class BubbleController {
  private state: BubbleSnapshot = {
    instanceId: randomUUID(),
    revision: 0,
    stateSequence: 0,
    preferences: { ...DEFAULT_BUBBLE_PREFERENCES },
    tracker: "not-requested",
    displayed: false,
    errorCode: null
  };
  private queue: Promise<unknown> = Promise.resolve();
  private writable = true;
  private stopping = false;
  private readonly listeners = new Set<(state: BubbleSnapshot) => void>();

  constructor(
    private readonly store: {
      load(): Promise<BubblePreferences>;
      save(preferences: BubblePreferences): Promise<void>;
    },
    private readonly apply: (preferences: BubblePreferences) => void
  ) {}

  async initialize() {
    try {
      this.state.preferences = await this.store.load();
    } catch {
      this.writable = false;
      this.state.errorCode = "SETTINGS_UNREADABLE";
    }
    this.apply(this.state.preferences);
  }

  snapshot(): BubbleSnapshot {
    return structuredClone(this.state);
  }

  watch(listener: (state: BubbleSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  change(value: unknown): Promise<BubbleResult> {
    const result = this.queue.then(async () => {
      const command = value as BubbleChange | undefined;
      if (this.stopping) return this.result(false, "STOPPING");
      if (!this.writable) return this.result(false, "SETTINGS_UNREADABLE");
      if (!command || !validPreferencePatch(command.patch))
        return this.result(false, "INVALID_REQUEST");
      if (
        command.instanceId !== this.state.instanceId ||
        command.revision !== this.state.revision
      ) {
        return this.result(false, "CONFLICT");
      }
      const next = { ...this.state.preferences, ...command.patch };
      try {
        await this.store.save(next);
      } catch {
        return this.result(false, "SAVE_FAILED");
      }
      this.state.preferences = next;
      ++this.state.revision;
      this.state.errorCode = null;
      this.apply(next);
      this.publish();
      return this.result(true);
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  runtime(tracker: BubbleTrackerState, displayed: boolean, errorCode: string | null = null) {
    if (
      this.state.tracker === tracker &&
      this.state.displayed === displayed &&
      this.state.errorCode === (this.writable ? errorCode : "SETTINGS_UNREADABLE")
    )
      return;
    this.state.tracker = tracker;
    this.state.displayed = displayed;
    if (this.writable) this.state.errorCode = errorCode;
    this.publish();
  }

  async stop() {
    this.stopping = true;
    await this.queue;
  }

  private result(ok: boolean, code?: string): BubbleResult {
    return { ok, ...(code ? { code } : {}), state: this.snapshot() };
  }

  private publish() {
    ++this.state.stateSequence;
    for (const listener of this.listeners) listener(this.snapshot());
  }
}
