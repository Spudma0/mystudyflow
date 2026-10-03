import { JSDOM, VirtualConsole } from 'jsdom';

/**
 * Skeletal structure drawing, server side.
 *
 * SmilesDrawer is a browser library, so it is given a jsdom window to draw
 * into and the finished SVG is serialised out. Doing it here rather than in
 * the app means no WebView and no native dependency on the client — the app
 * only has to render an SVG string, which react-native-svg already does.
 */

interface Rendered {
  svg: string;
  width: number;
  height: number;
}

/** Room around the drawer's box so edge labels — the H of an OH — aren't clipped. */
const PADDING = 12;

let drawerNamespace: any = null;
let documentRef: Document | null = null;
let serializer: { serializeToString: (node: Node) => string } | null = null;

/**
 * Builds the DOM the library expects, once.
 *
 * SmilesDrawer reaches for a scattering of DOM constructors while laying a
 * molecule out, so they are all copied onto the global rather than discovered
 * one crash at a time. jsdom's console is silenced because the library asks a
 * canvas for a text measurement it does not actually need, and jsdom logs a
 * "not implemented" notice every single time.
 */
function ensureDrawer() {
  if (drawerNamespace) return;

  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { virtualConsole });
  const w = dom.window as any;

  const globals = global as any;

  // Node defines some of these itself — `navigator` is getter-only from Node 22
  // — and a plain assignment throws in strict mode. defineProperty replaces
  // them outright, and anything that still refuses is one the drawer can live
  // without.
  const expose = (key: string, value: unknown) => {
    try {
      Object.defineProperty(globals, key, { value, configurable: true, writable: true });
    } catch {
      // Not settable and not needed.
    }
  };

  expose('window', w);
  expose('document', w.document);
  expose('navigator', w.navigator);
  expose('XMLSerializer', w.XMLSerializer);
  for (const key of Object.getOwnPropertyNames(w)) {
    if (/^(SVG|HTML|DOM|CSS|Node|Element|Document|Window|XML|Image)/.test(key) && globals[key] === undefined) {
      expose(key, w[key]);
    }
  }

  // Registers itself on `window` rather than exporting anything.
  require('smiles-drawer');

  drawerNamespace = w.SmilesDrawer;
  documentRef = w.document;
  serializer = new w.XMLSerializer();
}

/**
 * Draws a SMILES string as an SVG.
 *
 * Returns null for anything that isn't valid SMILES, so a model that invents a
 * structure costs a missing diagram rather than a broken screen.
 */
export function renderSmiles(smiles: string, theme: 'dark' | 'light' = 'dark'): Rendered | null {
  if (!smiles?.trim()) return null;

  try {
    ensureDrawer();
    const doc = documentRef!;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '300');
    doc.body.appendChild(svg);

    let failure: Error | null = null;
    // compactDrawing collapses small molecules into a condensed label —
    // ethanoic acid came out as the run-together "COOHCH3" rather than a
    // skeletal structure. Off, every molecule is drawn the way a textbook
    // draws it.
    new drawerNamespace.SmiDrawer({ width: 400, height: 300, compactDrawing: false }).draw(
      smiles.trim(),
      svg,
      theme,
      null,
      (err: Error) => {
        failure = err;
      }
    );

    if (failure) {
      svg.remove();
      return null;
    }

    // The drawer leaves a viewBox in its own units. Matching the width and
    // height to it keeps one unit as one pixel, so bonds and labels come out
    // the size the library intended instead of stretched to fill a fixed box.
    const box = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
    if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) {
      svg.remove();
      return null;
    }

    const width = Math.round(box[2] + PADDING * 2);
    const height = Math.round(box[3] + PADDING * 2);
    svg.setAttribute(
      'viewBox',
      `${box[0] - PADDING} ${box[1] - PADDING} ${box[2] + PADDING * 2} ${box[3] + PADDING * 2}`
    );
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const markup = serializer!.serializeToString(svg);
    svg.remove();
    return { svg: markup, width, height };
  } catch (err) {
    console.error('[chem/renderSmiles]', smiles, err);
    return null;
  }
}
