import {describe, expect, it} from "vitest";
import {renderFoldNetSvg} from "./dieline";
import {enumerateOrientations, generateWrapPlan, packedEnvelope, type ItemInput} from "./geometry";
import {foldNetFromRectangles, type FoldNet} from "./foldnet";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};

function fixtureNet() {
  const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
  const result = generateWrapPlan(envelope);
  if ("error" in result) throw new Error(result.error);
  return result.foldNet;
}

describe("canonical FoldNet SVG", () => {
  it("renders every canonical face, score, cut, and scrap id with calibrated metadata", () => {
    const net = fixtureNet();
    const svg = renderFoldNetSvg(net);
    net.faces.forEach(({id}) => expect(svg).toContain(`data-face="${id}"`));
    net.scores.forEach(({id}) => expect(svg).toContain(`data-mark="${id}"`));
    net.cuts.forEach(({id}) => expect(svg).toContain(`data-mark="${id}"`));
    net.scraps.forEach(({id}) => expect(svg).toContain(`data-scrap="${id}"`));
    expect(svg.match(/<polygon/g)).toHaveLength(net.faces.length);
    expect(svg.match(/<line id="[^"]+" data-mark=/g)).toHaveLength(net.scores.length + net.cuts.length);
    expect(svg.match(/<path/g)).toHaveLength(net.scraps.length);
    expect(svg).toContain('data-coordinate-system="flat-sheet-mm"');
    expect(svg).toContain('data-units="mm"');
    expect(svg).toContain('data-version="1"');
    expect(svg).toContain(`data-orientation-id="${net.metadata.orientation.id}"`);
    expect(svg).toContain('id="calibration-100mm"');
    expect(svg).toMatch(/width="[\d.]+mm" height="[\d.]+mm"/);
  });

  it("escapes hostile canonical and orientation ids without creating attributes", () => {
    const faceId = "face\" onload=\"evil&<>'";
    const scoreId = "score\" data-hostile=\"1&<>'";
    const cutId = "cut\" onclick=\"evil&<>'";
    const scrapId = "scrap\" onmouseover=\"evil&<>'";
    const orientationId = "orientation\" autofocus=\"evil&<>'";
    const net = foldNetFromRectangles({
      rectangles: [{id: faceId, xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, role: "PANEL"}],
      scores: [{id: scoreId, from: {xMm: 0, yMm: 0}, to: {xMm: 10, yMm: 0}}],
      cuts: [{id: cutId, kind: "boundary", from: {xMm: 10, yMm: 0}, to: {xMm: 10, yMm: 10}}],
      scrapRegions: [{id: scrapId, points: [{xMm: 0, yMm: -2}, {xMm: 10, yMm: -2}, {xMm: 10, yMm: -1}, {xMm: 0, yMm: -1}], exitDirection: [0, -1]}],
      orientation: {
        id: orientationId,
        packageDimensions: {lengthMm: 10, widthMm: 10, heightMm: 10},
        packageAxes: ["+L", "+W", "+H"],
        upright: true,
      },
    });
    const svg = renderFoldNetSvg(net);
    expect(svg).toContain('data-face="face&quot; onload=&quot;evil&amp;&lt;&gt;&#39;"');
    expect(svg).toContain('data-mark="score&quot; data-hostile=&quot;1&amp;&lt;&gt;&#39;"');
    expect(svg).toContain('data-mark="cut&quot; onclick=&quot;evil&amp;&lt;&gt;&#39;"');
    expect(svg).toContain('data-scrap="scrap&quot; onmouseover=&quot;evil&amp;&lt;&gt;&#39;"');
    expect(svg).toContain('data-orientation-id="orientation&quot; autofocus=&quot;evil&amp;&lt;&gt;&#39;"');
    expect(svg).not.toContain('onload="evil');
    expect(svg).not.toContain('onclick="evil');
    expect(svg).not.toContain("<script");
  });

  it("rejects invalid nets before emitting SVG", () => {
    const base = fixtureNet();
    const missingMetadata: FoldNet = {...base, metadata: undefined as unknown as FoldNet["metadata"]};
    const missingVertex: FoldNet = {
      ...base,
      faces: [{...base.faces[0], vertexIds: [...base.faces[0].vertexIds, "missing-svg-vertex"]}, ...base.faces.slice(1)],
    };
    expect(() => renderFoldNetSvg(missingMetadata)).toThrow(/MISSING_METADATA/);
    expect(() => renderFoldNetSvg(missingVertex)).toThrow(/MISSING_VERTEX/);
  });
});
