/*
 * Next Move decision engine.
 *
 * All the maths lives here, separate from the page, so it can be
 * tested on its own (see tests/engine.test.js). Every function is
 * "pure": it only reads the data passed in and never changes it.
 *
 * Data shapes used throughout:
 *   factors: [{ id, name, dealbreaker, min }]
 *   options: [{ id, name }]
 *   pairs:   { "factorA|factorB": -2..2 }   positive = A matters more
 *            A pair that is missing has not been answered and counts as Equal.
 *   scores:  { factorId: { optionId: { now: 1..5, later: 1..5 | null } } }
 *            A missing score counts as 3. A missing "later" copies "now".
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Pairwise answer -> "how many times more important" (Analytic Hierarchy Process scale)
  const PAIR_RATIO = { "2": 5, "1": 3, "0": 1, "-1": 1 / 3, "-2": 1 / 5 };
  // Random consistency index for 0..7 factors, used for the AHP consistency ratio
  const RANDOM_INDEX = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32];
  const MAX_SCORE = 5;

  // ---------- Reading answers ----------

  // The answer for "a vs b", whichever order it was stored in.
  function pairValue(pairs, aId, bId) {
    if (aId + "|" + bId in pairs) return { v: pairs[aId + "|" + bId], answered: true };
    if (bId + "|" + aId in pairs) return { v: -pairs[bId + "|" + aId], answered: true };
    return { v: 0, answered: false };
  }

  function countUnanswered(factors, pairs) {
    let total = 0, unanswered = 0;
    for (let i = 0; i < factors.length; i++) {
      for (let j = i + 1; j < factors.length; j++) {
        total++;
        if (!pairValue(pairs, factors[i].id, factors[j].id).answered) unanswered++;
      }
    }
    return { total, unanswered };
  }

  function cell(scores, fid, oid) {
    const c = (scores[fid] && scores[fid][oid]) || {};
    const now = c.now == null ? 3 : c.now;
    const later = c.later == null ? now : c.later;
    return { now, later };
  }

  // view: "now", "later", or "overall" (the average of both)
  function score(scores, fid, oid, view) {
    const c = cell(scores, fid, oid);
    if (view === "now") return c.now;
    if (view === "later") return c.later;
    return (c.now + c.later) / 2;
  }

  // ---------- 1. Weights from pairwise comparisons ----------

  // Geometric mean method: each factor's weight is the geometric mean of its row
  // in the comparison matrix, scaled so all weights add up to 1.
  function computeWeights(factors, pairs) {
    const n = factors.length;
    if (n === 0) return { w: [], cr: 0 };
    if (n === 1) return { w: [1], cr: 0 };

    const M = factors.map(() => new Array(n).fill(1));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ratio = PAIR_RATIO[String(pairValue(pairs, factors[i].id, factors[j].id).v)];
        M[i][j] = ratio;
        M[j][i] = 1 / ratio;
      }
    }
    const gm = M.map(row => Math.pow(row.reduce((p, x) => p * x, 1), 1 / n));
    const total = gm.reduce((s, x) => s + x, 0);
    const w = gm.map(x => x / total);

    // AHP consistency ratio (0 = perfectly consistent). Reported for reference.
    let cr = 0;
    if (n >= 3) {
      const lambda = M.reduce((s, row, i) => s + row.reduce((t, x, j) => t + x * w[j], 0) / w[i], 0) / n;
      cr = Math.max(0, ((lambda - n) / (n - 1)) / RANDOM_INDEX[n]);
    }
    return { w, cr };
  }

  // ---------- 2. Contradictions ----------

  // Looks at every group of three factors where the user answered all three
  // comparisons. If "a vs k" plus "k vs j" points a long way from "a vs j"
  // (by 2 or more steps on the answer scale), those answers can't all be true.
  // Untouched comparisons are ignored, so leaving pairs on Equal never triggers it.
  // Returns the worst conflict, or null.
  function findConflict(factors, pairs) {
    let worst = null;
    const n = factors.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          const ik = pairValue(pairs, factors[i].id, factors[k].id);
          const kj = pairValue(pairs, factors[k].id, factors[j].id);
          const ij = pairValue(pairs, factors[i].id, factors[j].id);
          if (!ik.answered || !kj.answered || !ij.answered) continue;
          const gap = Math.abs(ij.v - (ik.v + kj.v));
          // Prefer the version where the chained answers point "forwards" (positive)
          const tidy = (ik.v >= 0 && kj.v >= 0) ? 1 : 0;
          if (gap >= 2 && (!worst || gap > worst.gap || (gap === worst.gap && tidy > worst.tidy))) {
            worst = { a: i, b: k, c: j, ab: ik.v, bc: kj.v, ac: ij.v, gap, tidy };
          }
        }
      }
    }
    return worst;
  }

  // ---------- 3. Weighted scores and dealbreakers ----------

  // Returns options ranked best first, with ruled-out options at the end.
  // val is the weighted score (1..5); pct is val as a percentage of the maximum.
  function analyze(options, factors, w, scores, view) {
    const rows = options.map(o => {
      const val = factors.reduce((s, f, i) => s + w[i] * score(scores, f.id, o.id, view), 0);
      const reasons = [];
      factors.forEach(f => {
        if (!f.dealbreaker) return;
        const c = cell(scores, f.id, o.id);
        const lowest = Math.min(c.now, c.later);
        if (lowest < f.min) reasons.push({ factor: f, lowest, min: f.min });
      });
      return { opt: o, val, pct: Math.round((val / MAX_SCORE) * 100), ruledOut: reasons.length > 0, reasons };
    });
    rows.sort((a, b) => (a.ruledOut - b.ruledOut) || (b.val - a.val));
    return { rows, eligible: rows.filter(r => !r.ruledOut) };
  }

  // ---------- 4. Sensitivity analysis ----------

  // Finds the smallest change to one factor's share of the decision that would
  // make option b tie with option a. Other weights shrink or grow in proportion.
  //   level: "tie" | "fragile" (<= 10 points) | "moderate" (<= 25) | "solid"
  //   unbeatable: true when a is at least as good as b on every factor
  function robustness(aId, bId, factors, w, scores, view) {
    const diffs = factors.map(f => score(scores, f.id, aId, view) - score(scores, f.id, bId, view));
    const lead = diffs.reduce((s, d, i) => s + w[i] * d, 0);
    if (lead <= 1e-9) return { level: "tie" };

    let best = null;
    diffs.forEach((d, k) => {
      if (Math.abs(d) < 1e-9) return;
      const delta = -lead / d;            // raw weight change needed for a tie
      if (w[k] + delta <= 1e-9) return;   // the factor would need zero or negative weight: not a real flip
      const to = (w[k] + delta) / (1 + delta);
      const change = Math.abs(to - w[k]);
      if (!best || change < best.change) best = { factorIndex: k, from: w[k], to, change };
    });

    if (!best) return { level: "solid", unbeatable: true };
    const level = best.change <= 0.10 ? "fragile" : best.change <= 0.25 ? "moderate" : "solid";
    return { level, ...best };
  }

  return { PAIR_RATIO, pairValue, countUnanswered, score, computeWeights, findConflict, analyze, robustness };
});
