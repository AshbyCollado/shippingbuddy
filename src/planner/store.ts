"use client";
/* eslint-disable no-unused-vars */

import {create} from "zustand";
import {persist, type PersistStorage, type StorageValue} from "zustand/middleware";
import {z} from "zod";
import {measurementFromSource, SavedBoxSchema, type BoxMeasurementBasis, type SavedBox} from "@/domain/boxInventory";
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

type PersistedPlannerState = {draft: PlannerDraft; savedBoxes: SavedBox[]};

const PersistedPlannerStateSchema = z.object({
  draft: PlannerDraftSchema,
  savedBoxes: z.array(SavedBoxSchema).default([]),
}).strict();
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
  savedBoxes: SavedBox[];
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
  setExistingMeasurementBasis: (basis: BoxMeasurementBasis) => void;
  setBoardThickness: (valueMm: number | undefined) => void;
  setMeasurementUncertainty: (valueMm: number | undefined) => void;
  setSheetDimension: (axis: SheetAxis, valueMm: number) => void;
  setCommonBox: (id: string) => void;
  setPattern: (pattern: WrapPatternId) => void;
  saveCurrentBox: (name: string) => {ok: true; id: string} | {ok: false; message: string};
  renameSavedBox: (id: string, name: string) => boolean;
  selectSavedBox: (id: string) => boolean;
  removeSavedBox: (id: string) => void;
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

function createSavedBoxId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `box-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    savedBoxes: [],
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
        source: {...current.source, existingBox: {...current.source.existingBox, [axis]: valueMm}, selectedSavedBoxId: undefined},
      })),
    })),
    setExistingMeasurementBasis: (measurementBasis) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        source: {...current.source, measurementBasis, selectedSavedBoxId: undefined},
      })),
    })),
    setBoardThickness: (boardThicknessMm) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        source: {...current.source, boardThicknessMm, selectedSavedBoxId: undefined},
      })),
    })),
    setMeasurementUncertainty: (measurementUncertaintyMm) => set(({draft}) => ({
      draft: withTimestamp(draft, (current) => ({
        ...current,
        source: {...current.source, measurementUncertaintyMm, selectedSavedBoxId: undefined},
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
    saveCurrentBox: (name) => {
      const trimmedName = name.trim();
      if (!trimmedName) return {ok: false, message: "Enter a name for this box."};
      const current = get().draft.source;
      const candidate = SavedBoxSchema.safeParse({
        id: createSavedBoxId(),
        name: trimmedName,
        ...measurementFromSource(current),
      });
      if (!candidate.success) return {ok: false, message: "Check the box measurements before saving."};
      set(({draft, savedBoxes}) => ({
        savedBoxes: [...savedBoxes, candidate.data],
        draft: withTimestamp(draft, (value) => ({
          ...value,
          source: {...value.source, selectedSavedBoxId: candidate.data.id},
        })),
      }));
      return {ok: true, id: candidate.data.id};
    },
    renameSavedBox: (id, name) => {
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 100 || !get().savedBoxes.some((box) => box.id === id)) return false;
      set(({savedBoxes}) => ({savedBoxes: savedBoxes.map((box) => box.id === id ? {...box, name: trimmedName} : box)}));
      return true;
    },
    selectSavedBox: (id) => {
      const selected = get().savedBoxes.find((box) => box.id === id);
      if (!selected) return false;
      set(({draft}) => ({
        draft: withTimestamp(draft, (current) => ({
          ...current,
          source: {
            ...current.source,
            mode: "EXISTING_BOX",
            existingBox: {...selected.rawDimensions},
            measurementBasis: selected.basis,
            boardThicknessMm: selected.boardThicknessMm,
            measurementUncertaintyMm: selected.uncertaintyMm,
            selectedSavedBoxId: selected.id,
          },
        })),
      }));
      return true;
    },
    removeSavedBox: (id) => set(({draft, savedBoxes}) => {
      const nextBoxes = savedBoxes.filter((box) => box.id !== id);
      if (draft.source.selectedSavedBoxId !== id) return {savedBoxes: nextBoxes};
      return {
        savedBoxes: nextBoxes,
        draft: withTimestamp(draft, (current) => ({
          ...current,
          source: {...current.source, selectedSavedBoxId: undefined},
        })),
      };
    }),
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
    partialize: ({draft, savedBoxes}) => ({draft, savedBoxes}),
    merge: (persistedState, currentState) => {
      const parsed = PersistedPlannerStateSchema.safeParse(persistedState);
      return parsed.success ? {...currentState, draft: normalizeDraftProfile(parsed.data.draft), savedBoxes: parsed.data.savedBoxes} : currentState;
    },
    onRehydrateStorage: () => (state) => state?.finishHydration(),
  },
));
