import type {Dimensions3D, ItemInput, ItemShapeKind} from "./geometry";

export type ItemDimensionAxis = keyof Dimensions3D;

export interface ItemProfileField {
  axis: ItemDimensionAxis;
  label: string;
  help: string;
}

export interface ItemProfileDefinition {
  kind: ItemShapeKind;
  label: string;
  choiceHelp: string;
  measurementHelp: string;
  fields: readonly ItemProfileField[];
  warning?: string;
}

export const ITEM_PROFILE_DEFINITIONS: Record<ItemShapeKind, ItemProfileDefinition> = {
  RECTANGULAR_BOX: {
    kind: "RECTANGULAR_BOX",
    label: "Box",
    choiceHelp: "Square or rectangular sides",
    measurementHelp: "Measure the outside length, width, and height of the item itself.",
    fields: [
      {axis: "lengthMm", label: "Outside length", help: "Longest outside edge"},
      {axis: "widthMm", label: "Outside width", help: "Side-to-side outside edge"},
      {axis: "heightMm", label: "Outside height", help: "Bottom-to-top outside edge"},
    ],
  },
  CYLINDER_TUBE: {
    kind: "CYLINDER_TUBE",
    label: "Tube",
    choiceHelp: "Round like a bottle or poster tube",
    measurementHelp: "Measure end to end, then measure straight across the widest part of the round end.",
    fields: [
      {axis: "lengthMm", label: "Tube length", help: "End-to-end outside length"},
      {axis: "widthMm", label: "Outside diameter", help: "Straight across the widest round end"},
    ],
  },
  ROUNDED_FORM: {
    kind: "ROUNDED_FORM",
    label: "Rounded",
    choiceHelp: "Ball-shaped or softly rounded",
    measurementHelp: "Measure the widest outside diameter in each direction.",
    fields: [
      {axis: "lengthMm", label: "Longest diameter", help: "Widest end-to-end measurement"},
      {axis: "widthMm", label: "Side diameter", help: "Widest side-to-side measurement"},
      {axis: "heightMm", label: "Top diameter", help: "Widest bottom-to-top measurement"},
    ],
  },
  L_U_MEASURED: {
    kind: "L_U_MEASURED",
    label: "L / U shape",
    choiceHelp: "An item with an L- or U-shaped outline",
    measurementHelp: "Measure the full outside length, width, and height as if the item sat inside a rectangular outline.",
    fields: [
      {axis: "lengthMm", label: "Overall length", help: "Full end-to-end bound"},
      {axis: "widthMm", label: "Overall width", help: "Full side-to-side bound"},
      {axis: "heightMm", label: "Overall height", help: "Full bottom-to-top bound"},
    ],
    warning: "Conservative fit: Shipping Buddy uses the overall rectangular envelope. It does not calculate or reclaim the empty space inside the L or U shape.",
  },
};

export const ITEM_PROFILES = Object.values(ITEM_PROFILE_DEFINITIONS);

export function normalizeDimensionsForProfile(kind: ItemShapeKind, dimensions: Dimensions3D): Dimensions3D {
  if (kind !== "CYLINDER_TUBE") return {...dimensions};
  const diameterMm = Math.max(dimensions.widthMm, dimensions.heightMm);
  return {...dimensions, widthMm: diameterMm, heightMm: diameterMm};
}

export function updateProfileDimension(item: Pick<ItemInput, "dimensions" | "shapeProfile" | "profile">, axis: ItemDimensionAxis, valueMm: number): Dimensions3D {
  const kind = item.shapeProfile?.kind ?? item.profile?.kind ?? "RECTANGULAR_BOX";
  if (kind === "CYLINDER_TUBE" && (axis === "widthMm" || axis === "heightMm")) {
    return {...item.dimensions, widthMm: valueMm, heightMm: valueMm};
  }
  return {...item.dimensions, [axis]: valueMm};
}
