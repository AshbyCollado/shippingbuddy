import {afterEach, describe, expect, it} from "vitest";
import {
  acquireTutorialCardboardGeometry,
  createTutorialCardboardGeometry,
  disposeTutorialCardboardGeometryCache,
  tutorialCardboardGeometryCacheSize,
  tutorialCardboardGeometryResourceCount,
  type TutorialCardboardGeometryOptions,
} from "./tutorialGeometry";

const wallOptions: TutorialCardboardGeometryOptions = {
  span: 4,
  depth: 10,
  thickness: 0.6,
  fluteFrequency: 5,
  folds: [false, false, false, false],
  hasFluteCore: false,
};

const flapOptions: TutorialCardboardGeometryOptions = {
  ...wallOptions,
  folds: [false, false, true, false],
  hasFluteCore: true,
};

afterEach(() => disposeTutorialCardboardGeometryCache());

function expectFiniteGeometry(geometry: ReturnType<typeof createTutorialCardboardGeometry>) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  for (const attribute of [position, normal]) {
    for (let index = 0; index < attribute.count; index += 1) {
      expect([attribute.getX(index), attribute.getY(index), attribute.getZ(index)].every(Number.isFinite)).toBe(true);
    }
  }
  expect(geometry.boundingBox).not.toBeNull();
  expect(geometry.boundingSphere).not.toBeNull();
  expect([
    geometry.boundingBox!.min.x,
    geometry.boundingBox!.min.y,
    geometry.boundingBox!.min.z,
    geometry.boundingBox!.max.x,
    geometry.boundingBox!.max.y,
    geometry.boundingBox!.max.z,
    geometry.boundingSphere!.center.x,
    geometry.boundingSphere!.center.y,
    geometry.boundingSphere!.center.z,
    geometry.boundingSphere!.radius,
  ].every(Number.isFinite)).toBe(true);
}

describe("tutorial cardboard geometry parity", () => {
  it("retains tutorial segment counts with two wall skins, three flap layers, and physical cut cells", () => {
    const widthSegments = Math.floor(5 * wallOptions.span);
    const depthSegments = Math.floor(0.2 * wallOptions.depth);
    const verticesPerLayer = (widthSegments + 1) * (depthSegments + 1);
    const indicesPerLayer = widthSegments * depthSegments * 6;
    const wall = createTutorialCardboardGeometry(wallOptions);
    const flap = createTutorialCardboardGeometry(flapOptions);

    expect(widthSegments).toBe(20);
    expect(depthSegments).toBe(2);
    expect(wall.getAttribute("position").count).toBe(verticesPerLayer * 2);
    expect(wall.index?.count).toBe(indicesPerLayer * 2);
    expect(flap.getAttribute("position").count).toBe(verticesPerLayer * 3 + 4 * widthSegments);
    expect(flap.index?.count).toBe(indicesPerLayer * 3 + 6 * widthSegments);
    expectFiniteGeometry(wall);
    expectFiniteGeometry(flap);
    wall.dispose();
    flap.dispose();
  });

  it("matches the source skin and sinusoidal core z formulas exactly", () => {
    const geometry = createTutorialCardboardGeometry(flapOptions);
    const position = geometry.getAttribute("position");
    const verticesPerLayer = (Math.floor(5 * flapOptions.span) + 1) * (Math.floor(0.2 * flapOptions.depth) + 1);
    const sourceIndex = 15;
    const x = position.getX(sourceIndex);
    expect(x).toBe(1);
    expect(position.getZ(sourceIndex)).toBe(Math.fround(-0.5 * flapOptions.thickness + 0.01 * Math.sin(flapOptions.fluteFrequency * x)));
    expect(position.getZ(sourceIndex + verticesPerLayer)).toBe(Math.fround(0.5 * flapOptions.thickness + 0.01 * Math.sin(flapOptions.fluteFrequency * x)));
    expect(position.getZ(sourceIndex + 2 * verticesPerLayer)).toBe(Math.fround(0.5 * flapOptions.thickness * Math.sin(flapOptions.fluteFrequency * x)));
    geometry.dispose();
  });

  it("builds exact alternating upper and lower cut cells with directed winding and isolated dark colors", () => {
    const topGeometry = createTutorialCardboardGeometry(flapOptions);
    const bottomGeometry = createTutorialCardboardGeometry({...flapOptions, folds: [true, false, false, false]});
    const widthSegments = Math.floor(5 * flapOptions.span);
    const depthSegments = Math.floor(0.2 * flapOptions.depth);
    const verticesPerLayer = (widthSegments + 1) * (depthSegments + 1);
    const indicesPerLayer = widthSegments * depthSegments * 6;
    const cellVertexOffset = verticesPerLayer * 3;
    const cellIndexOffset = indicesPerLayer * 3;
    const position = topGeometry.getAttribute("position");
    const color = topGeometry.getAttribute("color");

    expect(position.count - cellVertexOffset).toBe(4 * widthSegments);
    expect(topGeometry.index!.count - cellIndexOffset).toBe(6 * widthSegments);
    expect(color.count).toBe(position.count);

    for (let vertex = 0; vertex < cellVertexOffset; vertex += 1) {
      expect([color.getX(vertex), color.getY(vertex), color.getZ(vertex)]).toEqual([1, 1, 1]);
    }

    for (let segment = 0; segment < widthSegments; segment += 1) {
      const x0 = -0.5 * flapOptions.span + segment * flapOptions.span / widthSegments;
      const x1 = -0.5 * flapOptions.span + (segment + 1) * flapOptions.span / widthSegments;
      const profile = (x: number) => ({
        core: 0.5 * flapOptions.thickness * Math.sin(flapOptions.fluteFrequency * x),
        low: -0.5 * flapOptions.thickness + 0.01 * Math.sin(flapOptions.fluteFrequency * x),
        high: 0.5 * flapOptions.thickness + 0.01 * Math.sin(flapOptions.fluteFrequency * x),
      });
      const start = profile(x0);
      const end = profile(x1);
      const upperCell = Math.sin(flapOptions.fluteFrequency * (x0 + x1) / 2) >= 0;
      const expectedZ = upperCell
        ? [start.core, start.high, end.core, end.high]
        : [start.low, start.core, end.low, end.core];
      const vertex = cellVertexOffset + segment * 4;

      expect([0, 1, 2, 3].map((offset) => position.getX(vertex + offset))).toEqual([
        Math.fround(x0),
        Math.fround(x0),
        Math.fround(x1),
        Math.fround(x1),
      ]);
      expect([0, 1, 2, 3].map((offset) => position.getY(vertex + offset))).toEqual([
        flapOptions.depth / 2,
        flapOptions.depth / 2,
        flapOptions.depth / 2,
        flapOptions.depth / 2,
      ]);
      expectedZ.forEach((expected, offset) => expect(position.getZ(vertex + offset)).toBe(Math.fround(expected)));
      for (let offset = 0; offset < 4; offset += 1) {
        expect(color.getX(vertex + offset)).toBeCloseTo(0.55);
        expect(color.getY(vertex + offset)).toBeCloseTo(0.55);
        expect(color.getZ(vertex + offset)).toBeCloseTo(0.55);
      }
    }

    expect(Array.from({length: 6}, (_, offset) => topGeometry.index!.getX(cellIndexOffset + offset))).toEqual([
      cellVertexOffset,
      cellVertexOffset + 3,
      cellVertexOffset + 2,
      cellVertexOffset,
      cellVertexOffset + 1,
      cellVertexOffset + 3,
    ]);
    expect(Array.from({length: 6}, (_, offset) => bottomGeometry.index!.getX(cellIndexOffset + offset))).toEqual([
      cellVertexOffset,
      cellVertexOffset + 2,
      cellVertexOffset + 3,
      cellVertexOffset,
      cellVertexOffset + 3,
      cellVertexOffset + 1,
    ]);
    topGeometry.dispose();
    bottomGeometry.dispose();
  });

  it("recesses only the two liner free edges by one caliper without exceeding nominal flap bounds", () => {
    const geometry = createTutorialCardboardGeometry(flapOptions);
    const position = geometry.getAttribute("position");
    const widthSegments = Math.floor(5 * flapOptions.span);
    const depthSegments = Math.floor(0.2 * flapOptions.depth);
    const verticesPerLayer = (widthSegments + 1) * (depthSegments + 1);
    const cellVertexOffset = verticesPerLayer * 3;
    const yValues = (start: number, count: number) => Array.from({length: count}, (_, offset) => position.getY(start + offset));
    const revealDepth = Math.min(
      flapOptions.depth / 4,
      Math.max(flapOptions.thickness, flapOptions.span / widthSegments),
    );

    expect(Math.max(...yValues(0, verticesPerLayer))).toBeCloseTo(flapOptions.depth / 2 - revealDepth);
    expect(Math.max(...yValues(verticesPerLayer, verticesPerLayer))).toBeCloseTo(flapOptions.depth / 2 - revealDepth);
    expect(Math.max(...yValues(verticesPerLayer * 2, verticesPerLayer))).toBe(flapOptions.depth / 2);
    expect(yValues(cellVertexOffset, 4 * widthSegments).every((y) => y === flapOptions.depth / 2)).toBe(true);
    expect(geometry.boundingBox!.min.y).toBe(-flapOptions.depth / 2);
    expect(geometry.boundingBox!.max.y).toBe(flapOptions.depth / 2);
    geometry.dispose();
  });

  it("rejects missing, mixed, and ambiguous flute flap topology", () => {
    for (const folds of [
      [false, false, false, false],
      [true, false, true, false],
      [false, true, true, false],
      [false, false, true, true],
    ] as const) {
      expect(() => createTutorialCardboardGeometry({...flapOptions, folds})).toThrow(/unambiguous top or bottom flap free edge/);
    }
  });

  it("attenuates a declared top hinge to zero with the tutorial tenth-power curve", () => {
    const options: TutorialCardboardGeometryOptions = {...flapOptions, depth: 20, folds: [true, false, false, false]};
    const geometry = createTutorialCardboardGeometry(options);
    const position = geometry.getAttribute("position");
    const topEdgeZ: number[] = [];
    for (let index = 0; index < position.count; index += 1) {
      if (position.getY(index) === options.depth / 2) topEdgeZ.push(position.getZ(index));
    }
    expect(topEdgeZ.length).toBeGreaterThan(0);
    expect(topEdgeZ.every((value) => Math.abs(value) < 1e-12)).toBe(true);

    const interiorIndex = Array.from({length: position.count}, (_, index) => index)
      .find((index) => position.getX(index) === 1 && position.getY(index) === options.depth / 4)!;
    const rawZ = -0.5 * options.thickness + 0.01 * Math.sin(options.fluteFrequency);
    expect(position.getZ(interiorIndex)).toBe(Math.fround(rawZ * (1 - Math.pow(0.5, 10))));
    geometry.dispose();
  });

  it("rejects non-finite and non-positive geometry inputs", () => {
    for (const [field, value] of [
      ["span", 0],
      ["span", Number.NaN],
      ["depth", -1],
      ["depth", Number.POSITIVE_INFINITY],
      ["thickness", 0],
      ["fluteFrequency", -5],
    ] as const) {
      expect(() => createTutorialCardboardGeometry({...wallOptions, [field]: value})).toThrow(/finite positive number/);
    }
  });
});

describe("tutorial geometry cache ownership", () => {
  it("shares acquisitions and releases reference counts exactly and idempotently", () => {
    const first = acquireTutorialCardboardGeometry(wallOptions);
    const second = acquireTutorialCardboardGeometry({...wallOptions});
    expect(second.geometry).toBe(first.geometry);
    expect(tutorialCardboardGeometryCacheSize()).toBe(1);
    expect(tutorialCardboardGeometryResourceCount()).toBe(2);

    first.release();
    expect(tutorialCardboardGeometryCacheSize()).toBe(1);
    expect(tutorialCardboardGeometryResourceCount()).toBe(1);
    first.release();
    expect(tutorialCardboardGeometryResourceCount()).toBe(1);

    second.release();
    expect(tutorialCardboardGeometryCacheSize()).toBe(0);
    expect(tutorialCardboardGeometryResourceCount()).toBe(0);
    second.release();
    expect(tutorialCardboardGeometryResourceCount()).toBe(0);
  });

  it("explicit cleanup disposes all distinct cached resources and tolerates later releases", () => {
    const wall = acquireTutorialCardboardGeometry(wallOptions);
    const flap = acquireTutorialCardboardGeometry(flapOptions);
    expect(tutorialCardboardGeometryCacheSize()).toBe(2);
    expect(tutorialCardboardGeometryResourceCount()).toBe(2);
    disposeTutorialCardboardGeometryCache();
    expect(tutorialCardboardGeometryCacheSize()).toBe(0);
    expect(tutorialCardboardGeometryResourceCount()).toBe(0);
    wall.release();
    flap.release();
    expect(tutorialCardboardGeometryCacheSize()).toBe(0);
    expect(tutorialCardboardGeometryResourceCount()).toBe(0);
  });
});
