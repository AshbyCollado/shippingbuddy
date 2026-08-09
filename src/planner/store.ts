"use client";
/* eslint-disable no-unused-vars */

import {create} from "zustand";
import {persist, type PersistStorage, type StorageValue} from "zustand/middleware";
import {z} from "zod";
import {PROTECTION_GOAL_MM, type Fragility, type ItemShapeKind, type ProtectionGoal, type WrapPatternId} from "@/domain/geometry";
import {normalizeDimensionsForProfile, updateProfileDimension} from "@/domain/itemProfiles";
import type {DisplayUnit} from "@/domain/measurements";
import {
  createDefaultPlannerDraft,
  parsePlannerDraftJson,
  PLANNER_DRAFT_SCHEMA_VERSION,
  PLANNER_STORAGE_KEY,
  PlannerDraftSchema,
  serializePlannerDraft,
  type PlannerDraft,
  type PlannerSourceMode,
} from "./draft";

type DimensionAxis = "lengthMm" | "widthMm" | "heightMm";
type SheetAxis = "lengthMm" | "widthMm";
type HydrationState = "loading" | "ready";

type PersistedPlannerState = {draft: PlannerDraft};

const PersistedPlannerStateSchema = z.object({draft: PlannerDraftSchema}).strict();
const StoredEnvelopeSchema = z.object({
  state: PersistedPlannerStateSchema,
  version: z.literal(PLANNER_DRAFT_SCHEMA_VERSION),
}).strict();

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

const validatedStorage: PersistStorage<PersistedPlannerState> = {
  getItem(name) {
    const storage = browserStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(name);
      if (!raw) return null;
      const parsed = StoredEnvelopeSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success) return parsed.data;
      try {
        storage.removeItem(name);
      } catch {
        // Removing invalid storage is best effort.
      }
      return null;
    } catch {
      try {
        storage.removeItem(name);
      } catch {
        // Removing unreadable storage is best effort.
      }
      return null;
    }
  },
  setItem(name, value: StorageValue<PersistedPlannerState>) {
    const storage = browserStorage();
    if (!storage) return;
    try {
      const parsed = StoredEnvelopeSchema.safeParse(value);
      if (parsed.success) storage.setItem(name, JSON.stringify(parsed.data));
    } catch {
      // Storage can be unavailable or full. The in-memory draft remains usable.
    }
  },
  removeItem(name) {
    try {
      browserStorage()?.removeItem(name);
    } catch {
      // Clearing storage is best effort.
    }
  },
};

export type PlannerStore = {
  draft: PlannerDraft;
  hydration: HydrationState;
  finishHydration: () => void;
  setUnit: (unit: DisplayUnit) => void;
  setItemDimension: (axis: DimensionAxis, valueMm: number) => void;
  setItemWeight: (weightKg: number) => void;
  setItemShape: (kind: ItemShapeKind) => void;
  setFragility: (fragility: Fragility) => void;
  setProtectionGoal: (goal: ProtectionGoal) => void;
  setClearance: (valueMm: number) => void;
  setAllowRotation: (allowRotation: boolean) => void;
  setKeepUpright: (keepUpright: boolean) => void;
  setSourceMode: (mode: PlannerSourceMode) => void;
  setExistingBoxDimension: (axis: DimensionAxis, valueMm: number) => void;
  setSheetDimension: (axis: SheetAxis, valueMm: number) => void;
  setCommonBox: (id: string) => void;
  setPattern: (pattern: WrapPatternId) => void;
  resetDraft: () => void;
  exportDraft: () => string;
  importDraft: (json: string) => {ok: true} | {ok: false; message: string};
};

function withTimestamp(draft: PlannerDraft, change: (current: PlannerDraft) => PlannerDraft): PlannerDraft {
  return {...change(draft), updatedAt: new Date().toISOString()};
}

function normalizeDraftProfile(draft: PlannerDraft): PlannerDraft {
  const kind = draft.item.shapeProfile.kind;
  return {...draft, item: {...draft.item, dimensions: normalizeDimensionsForProfile(kind, draft.item.dimensions)}};
}

const cushioningForGoal = (goal: ProtectionGoal) => {
  const valueMm = PROTECTION_GOAL_MM[goal];
  return {
    leftMm: valueMm,
    rightMm: valueMm,
    frontMm: valueMm,
    backMm: valueMm,
    bottomMm: valueMm,
    topMm: valueMm,
  };
};

export const usePlannerStore = create<PlannerStore>()(persist(
  (set, get) => ({
    draft: createDefaultPlannerDraft(),
    hydration: "loading",
    finishHydration: () => set({hydration: "ready"}),
    setUnit: (unit) => set(({draft}) => ({draft: withTimestamp(draft, (current) => ({...current, unit}))})),
    setItemDimension: (axis, valueMm) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        item: {...current.item, dimensions: updateProfileDimension(current.item, axis, valueMm)},
      })),
    })),
    setItemWeight: (weightKg) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, item: {...current.item, weightKg}})),
    })),
    setItemShape: (kind) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        item: {
          ...current.item,
          shapeProfile: {kind},
          dimensions: normalizeDimensionsForProfile(kind, current.item.dimensions),
        },
      })),
    })),
    setFragility: (fragility) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, item: {...current.item, fragility}})),
    })),
    setProtectionGoal: (protectionGoal) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        protectionGoal,
        item: {...current.item, cushioning: cushioningForGoal(protectionGoal)},
      })),
    })),
    setClearance: (valueMm) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        item: {
          ...current.item,
          tolerance: {lengthTotalMm: valueMm, widthTotalMm: valueMm, heightTotalMm: valueMm},
        },
      })),
    })),
    setAllowRotation: (allowRotation) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, item: {...current.item, allowRotation}})),
    })),
    setKeepUpright: (keepUpright) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, item: {...current.item, keepUpright}})),
    })),
    setSourceMode: (mode) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, source: {...current.source, mode}})),
    })),
    setExistingBoxDimension: (axis, valueMm) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        source: {...current.source, existingBox: {...current.source.existingBox, [axis]: valueMm}},
      })),
    })),
    setSheetDimension: (axis, valueMm) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        source: {...current.source, sheet: {...current.source.sheet, [axis]: valueMm}},
      })),
    })),
    setCommonBox: (selectedCommonBoxId) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, source: {...current.source, selectedCommonBoxId}})),
    })),
    setPattern: (pattern) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({...current, source: {...current.source, pattern}})),
    })),
    resetDraft: () => set({draft: createDefaultPlannerDraft()}),
    exportDraft: () => serializePlannerDraft(get().draft),
    importDraft: (json) => {
      const parsed = parsePlannerDraftJson(json);
      if (!parsed.success) return {ok: false, message: "That file is not a valid Shipping Buddy draft."};
      set({draft: normalizeDraftProfile({...parsed.data, updatedAt: new Date().toISOString()})});
      return {ok: true};
    },
  }),
  {
    name: PLANNER_STORAGE_KEY,
    version: PLANNER_DRAFT_SCHEMA_VERSION,
    storage: validatedStorage,
    skipHydration: true,
    partialize: ({draft}) => ({draft}),
    merge: (persistedState, currentState) => {
      const parsed = PersistedPlannerStateSchema.safeParse(persistedState);
      return parsed.success ? {...currentState, draft: normalizeDraftProfile(parsed.data.draft)} : currentState;
    },
    onRehydrateStorage: () => (state) => state?.finishHydration(),
  },
));
