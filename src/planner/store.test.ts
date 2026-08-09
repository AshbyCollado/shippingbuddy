import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {createDefaultPlannerDraft, PLANNER_DRAFT_SCHEMA_VERSION, PLANNER_STORAGE_KEY, type PlannerDraft} from "./draft";
import {usePlannerStore} from "./store";

class MemoryStorage implements Storage {
  #entries = new Map<string, string>();
  removals: string[] = [];

  get length() { return this.#entries.size; }
  clear() { this.#entries.clear(); }
  getItem(key: string) { return this.#entries.get(key) ?? null; }
  key(index: number) { return [...this.#entries.keys()][index] ?? null; }
  removeItem(key: string) { this.removals.push(key); this.#entries.delete(key); }
  setItem(key: string, value: string) { this.#entries.set(key, String(value)); }
}

const originalWindow = globalThis.window;
let storage: MemoryStorage;

function savedEnvelope(draft: PlannerDraft, version: number = PLANNER_DRAFT_SCHEMA_VERSION) {
  return JSON.stringify({state: {draft}, version});
}

describe("planner draft persistence", () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", {configurable: true, value: {localStorage: storage}});
    usePlannerStore.setState({draft: createDefaultPlannerDraft(), hydration: "loading"});
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {configurable: true, value: originalWindow});
  });

  it("persists only the versioned draft shape", () => {
    usePlannerStore.getState().setItemDimension("lengthMm", 400);
    const raw = storage.getItem(PLANNER_STORAGE_KEY);

    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope).toEqual({
      state: {draft: expect.objectContaining({schemaVersion: PLANNER_DRAFT_SCHEMA_VERSION})},
      version: PLANNER_DRAFT_SCHEMA_VERSION,
    });
    expect(envelope.state).not.toHaveProperty("hydration");
    expect(envelope.state.draft).not.toHaveProperty("generatedPlan");
    expect(envelope.state.draft).not.toHaveProperty("methods");
    expect(envelope.state.draft.item.dimensions.lengthMm).toBe(400);
  });

  it("imports an exported draft and rejects malformed import files", () => {
    const exported = usePlannerStore.getState().exportDraft();
    usePlannerStore.getState().setItemDimension("lengthMm", 400);

    expect(usePlannerStore.getState().importDraft(exported)).toEqual({ok: true});
    expect(usePlannerStore.getState().draft.item.dimensions.lengthMm).toBe(355.6);
    expect(usePlannerStore.getState().importDraft("not json")).toEqual({
      ok: false,
      message: "That file is not a valid Shipping Buddy draft.",
    });
  });

  it("synchronizes both tube diameter axes in the persisted draft", () => {
    usePlannerStore.getState().setItemShape("CYLINDER_TUBE");
    usePlannerStore.getState().setItemDimension("widthMm", 72);
    expect(usePlannerStore.getState().draft.item.dimensions).toMatchObject({widthMm: 72, heightMm: 72});

    usePlannerStore.getState().setItemDimension("heightMm", 88);
    expect(usePlannerStore.getState().draft.item.dimensions).toMatchObject({widthMm: 88, heightMm: 88});
  });

  it("removes invalid local storage rather than merging it", async () => {
    storage.setItem(PLANNER_STORAGE_KEY, "{bad json");

    await usePlannerStore.persist.rehydrate();

    expect(storage.removals).toContain(PLANNER_STORAGE_KEY);
    expect(JSON.parse(storage.getItem(PLANNER_STORAGE_KEY)!)).toMatchObject({
      state: {draft: {schemaVersion: PLANNER_DRAFT_SCHEMA_VERSION}},
      version: PLANNER_DRAFT_SCHEMA_VERSION,
    });
    expect(usePlannerStore.getState().hydration).toBe("ready");
  });

  it("rejects a valid-looking envelope with the wrong storage version", async () => {
    const draft = createDefaultPlannerDraft();
    storage.setItem(PLANNER_STORAGE_KEY, savedEnvelope(draft, PLANNER_DRAFT_SCHEMA_VERSION + 1));

    await usePlannerStore.persist.rehydrate();

    expect(storage.removals).toContain(PLANNER_STORAGE_KEY);
    expect(JSON.parse(storage.getItem(PLANNER_STORAGE_KEY)!)).toMatchObject({
      state: {draft: {schemaVersion: PLANNER_DRAFT_SCHEMA_VERSION}},
      version: PLANNER_DRAFT_SCHEMA_VERSION,
    });
  });

  it("rehydrates a saved draft before any default-state mutation can replace it", async () => {
    const saved = {...createDefaultPlannerDraft(), draftId: "saved-draft", item: {...createDefaultPlannerDraft().item, dimensions: {...createDefaultPlannerDraft().item.dimensions, lengthMm: 444}}};
    storage.setItem(PLANNER_STORAGE_KEY, savedEnvelope(saved));

    await usePlannerStore.persist.rehydrate();

    expect(usePlannerStore.getState().draft).toEqual(saved);
    expect(storage.getItem(PLANNER_STORAGE_KEY)).toBe(savedEnvelope(saved));
  });
});
