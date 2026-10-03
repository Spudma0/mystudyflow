import { Router } from 'express';
import { renderSmiles } from '../chem.js';

/**
 * Structure diagrams.
 *
 * A drawing depends only on the SMILES string, so the same structure is drawn
 * once and served from memory after that — and cached hard by the client too,
 * since the answer can never change for a given input.
 */

export const chemRouter = Router();

/** Drawings are small and the set a student meets is finite. */
const MAX_CACHED = 500;
const cache = new Map<string, { svg: string; width: number; height: number }>();

/** SMILES is punctuation-heavy; this is the character set, not a grammar. */
const SMILES_SHAPE = /^[A-Za-z0-9@+\-[\]()=#$:/\\.%*]{1,400}$/;

/**
 * GET /api/chem/structure?smiles=CCO&theme=dark
 *
 * Returns the SVG itself, so the app can hand it straight to its renderer.
 */
chemRouter.get('/structure', (req, res) => {
  const smiles = String(req.query.smiles ?? '').trim();
  const theme = req.query.theme === 'light' ? 'light' : 'dark';

  if (!smiles) {
    res.status(400).json({ error: 'A smiles parameter is required.' });
    return;
  }
  if (!SMILES_SHAPE.test(smiles)) {
    res.status(400).json({ error: 'That does not look like a SMILES string.' });
    return;
  }

  const key = `${theme}:${smiles}`;
  let drawn = cache.get(key);

  if (!drawn) {
    const result = renderSmiles(smiles, theme);
    if (!result) {
      res.status(422).json({ error: 'That SMILES string could not be drawn.' });
      return;
    }
    // Oldest out first; a Map iterates in insertion order.
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
    cache.set(key, result);
    drawn = result;
  }

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  // The drawing for a given SMILES never changes, so it can be kept for good.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Structure-Width', String(drawn.width));
  res.setHeader('X-Structure-Height', String(drawn.height));
  res.send(drawn.svg);
});
