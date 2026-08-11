import {
  validateFoldNet,
  type FoldNet,
  type FoldNetCut,
  type FoldNetMark,
  type FoldNetVertex,
} from "./foldnet";

function escapeAttribute(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

function vertexMap(net: FoldNet) {
  return new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
}
function requiredVertex(
  vertices: Map<string, FoldNetVertex>,
  id: string,
  owner: string,
) {
  const vertex = vertices.get(id);
  if (!vertex || ![vertex.xMm, vertex.yMm].every(Number.isFinite))
    throw new Error(
      `FoldNet ${owner} references missing or non-finite vertex ${id}.`,
    );
  return vertex;
}
function lineMarkup(
  vertices: Map<string, FoldNetVertex>,
  mark: FoldNetMark | FoldNetCut,
) {
  const from = requiredVertex(vertices, mark.fromVertexId, mark.id);
  const to = requiredVertex(vertices, mark.toVertexId, mark.id);
  const kind = "kind" in mark ? mark.kind : "score";
  return `<line id="${escapeAttribute(mark.id)}" data-mark="${escapeAttribute(mark.id)}" data-kind="${escapeAttribute(kind)}" x1="${from.xMm}" y1="${from.yMm}" x2="${to.xMm}" y2="${to.yMm}" class="${kind === "score" || kind === "hinge" ? "score" : "cut"}"/>`;
}

/** Render the canonical polygon net to a calibrated millimetre SVG. */
export function renderFoldNetSvg(net: FoldNet): string {
  const validation = validateFoldNet(net);
  if (!validation.valid)
    throw new Error(
      `Cannot render invalid FoldNet [${validation.diagnosticCodes.join(",")}]: ${validation.errors.join("; ")}`,
    );
  const vertices = vertexMap(net);
  const points = net.vertices;
  if (!points.length)
    throw new Error("FoldNet cannot render without vertices.");
  const minX = Math.min(...points.map((point) => point.xMm));
  const minY = Math.min(...points.map((point) => point.yMm));
  const maxX = Math.max(...points.map((point) => point.xMm));
  const maxY = Math.max(...points.map((point) => point.yMm));
  if (![minX, minY, maxX, maxY].every(Number.isFinite))
    throw new Error("FoldNet cannot render non-finite coordinates.");
  const padding = 26;
  const calibrationX = Math.max(minX, maxX - 100);
  const calibrationY = maxY + 14;
  const contentMaxX = Math.max(maxX, calibrationX + 100);
  const contentMaxY = maxY + 27;
  const width = contentMaxX - minX + padding * 2;
  const height = contentMaxY - minY + padding * 2;
  const tx = -minX + padding;
  const ty = -minY + padding;
  const polygons = net.faces
    .map((face) => {
      const facePoints = face.vertexIds.map((id) =>
        requiredVertex(vertices, id, face.id),
      );
      if (facePoints.length < 3)
        throw new Error(
          `FoldNet face ${face.id} has fewer than three vertices.`,
        );
      return `<polygon id="${escapeAttribute(face.id)}" data-face="${escapeAttribute(face.id)}" points="${facePoints.map((point) => `${point.xMm},${point.yMm}`).join(" ")}" class="${face.role.toLowerCase()}"/>`;
    })
    .join("");
  const marks = net.scores.map((mark) => lineMarkup(vertices, mark)).join("");
  const cuts = net.cuts.map((cut) => lineMarkup(vertices, cut)).join("");
  const scraps = (net.scraps ?? [])
    .map((scrap) => {
      const scrapPoints = scrap.vertexIds.map((id) =>
        requiredVertex(vertices, id, scrap.id),
      );
      if (scrapPoints.length < 3)
        throw new Error(
          `FoldNet scrap ${scrap.id} has fewer than three vertices.`,
        );
      const path = `${scrapPoints.map((point, index) => `${index ? "L" : "M"}${point.xMm},${point.yMm}`).join(" ")} Z`;
      return `<path id="${escapeAttribute(scrap.id)}" data-scrap="${escapeAttribute(scrap.id)}" d="${path}" class="scrap"/>`;
    })
    .join("");
  const orientationId = net.metadata.orientation.id;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-coordinate-system="flat-sheet-mm" data-units="mm" data-version="1" data-orientation-id="${escapeAttribute(orientationId)}"><title>Shipping Buddy wrap box cutting layout</title><desc>Millimetre cutting layout. Use the calibration bar and verify actual material before cutting.</desc><style>.panel{fill:#dff3eb;stroke:#8bcab5;stroke-width:1}.flap{fill:#fff1de;stroke:#e7b778;stroke-width:1}.tab{fill:#f7e1cc;stroke:#dc9c62;stroke-width:1}.scrap{fill:#edf0ef;stroke:#aab6b1;stroke-width:1;stroke-dasharray:4 3}.score{stroke:#379e7e;stroke-width:1.7;stroke-dasharray:8 6}.cut{stroke:#e17e62;stroke-width:2}</style><g transform="translate(${tx} ${ty})">${polygons}${scraps}${marks}${cuts}<line id="calibration-100mm" x1="${calibrationX}" y1="${calibrationY}" x2="${calibrationX + 100}" y2="${calibrationY}" stroke="#17222b" stroke-width="2"/><text x="${calibrationX}" y="${calibrationY + 13}" font-family="monospace" font-size="9">100 mm calibration bar</text></g></svg>`;
}
