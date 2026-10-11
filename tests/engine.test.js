// Tests for the decision engine. Run with: npm test
// Uses Node's built-in test runner, so there is nothing to install.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../engine.js");
const CATEGORIES = require("../categories.js");

const close = (actual, expected, tolerance = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

const factor = (id, extra = {}) => ({ id, name: id, dealbreaker: false, min: 3, ...extra });
const option = id => ({ id, name: id });

// Builds a scores object from { factorId: { optionId: rating } }
function scoresFrom(table) {
  const scores = {};
  for (const [f, row] of Object.entries(table)) {
    scores[f] = {};
    for (const [o, v] of Object.entries(row)) {
      scores[f][o] = Array.isArray(v) ? { now: v[0], later: v[1] } : { now: v, later: null };
    }
  }
  return scores;
}

// A complete worked example used in several tests: choosing a pet
const PET = {
  factors: [factor("care"), factor("cuddly"), factor("flat", { dealbreaker: true, min: 4 })],
  options: [option("cat"), option("dog"), option("fish")],
  pairs: { "care|cuddly": -1 }, // cuddly matters more than care; other pairs untouched
  scores: scoresFrom({
    care:   { cat: 4, dog: 2, fish: 5 },
    cuddly: { cat: 4, dog: 5, fish: 1 },
    flat:   { cat: 5, dog: 3, fish: 5 }
  })
};

describe("weights from pairwise comparisons", () => {
  test("no answers gives equal weights", () => {
    const { w } = Engine.computeWeights([factor("a"), factor("b"), factor("c")], {});
    w.forEach(x => close(x, 1 / 3));
  });

  test("weights always add up to 1", () => {
    const f = ["a", "b", "c", "d", "e"].map(id => factor(id));
    const pairs = { "a|b": 2, "a|c": -1, "b|d": 1, "c|e": -2, "d|e": 1 };
    const { w } = Engine.computeWeights(f, pairs);
    close(w.reduce((s, x) => s + x, 0), 1, 1e-9);
  });

  test("'much more important' means 5 times the weight", () => {
    const { w } = Engine.computeWeights([factor("a"), factor("b")], { "a|b": 2 });
    close(w[0], 5 / 6);
    close(w[1], 1 / 6);
  });

  test("an answer stored in the opposite order counts the same", () => {
    const f = [factor("a"), factor("b")];
    assert.deepEqual(Engine.computeWeights(f, { "a|b": 1 }).w, Engine.computeWeights(f, { "b|a": -1 }).w);
  });

  test("perfectly consistent answers have a consistency ratio of 0", () => {
    // a = 3b, b = 3c would need a = 9c, which the scale can't express,
    // so use a consistent set: all equal except a is 3x both b and c
    const f = [factor("a"), factor("b"), factor("c")];
    const { cr } = Engine.computeWeights(f, { "a|b": 1, "a|c": 1, "b|c": 0 });
    close(cr, 0, 1e-9);
  });
});

describe("weighted scores", () => {
  test("pet example: cat wins with 86%, fish 63%", () => {
    const { w } = Engine.computeWeights(PET.factors, PET.pairs);
    const { rows } = Engine.analyze(PET.options, PET.factors, w, PET.scores, "overall");
    assert.equal(rows[0].opt.id, "cat");
    assert.equal(rows[0].pct, 86);
    assert.equal(rows[1].opt.id, "fish");
    assert.equal(rows[1].pct, 63);
  });

  test("missing scores count as 3 and a missing long-term score copies the short-term one", () => {
    const f = [factor("a")];
    const scores = scoresFrom({ a: { x: 5 } });
    assert.equal(Engine.score(scores, "a", "x", "later"), 5);
    assert.equal(Engine.score(scores, "a", "y", "overall"), 3);
  });

  test("the overall view averages short and long term", () => {
    const scores = scoresFrom({ a: { x: [2, 4] } });
    assert.equal(Engine.score(scores, "a", "x", "overall"), 3);
  });

  test("the input data is never changed", () => {
    const scores = scoresFrom({ a: { x: 4 } });
    const before = JSON.stringify(scores);
    Engine.analyze([option("x"), option("y")], [factor("a")], [1], scores, "overall");
    assert.equal(JSON.stringify(scores), before);
  });
});

describe("dealbreakers", () => {
  test("an option below the minimum is ruled out and listed last", () => {
    const { w } = Engine.computeWeights(PET.factors, PET.pairs);
    const { rows, eligible } = Engine.analyze(PET.options, PET.factors, w, PET.scores, "overall");
    const dog = rows.find(r => r.opt.id === "dog");
    assert.equal(dog.ruledOut, true);
    assert.equal(dog.reasons[0].lowest, 3);
    assert.equal(rows[rows.length - 1].opt.id, "dog");
    assert.equal(eligible.length, 2);
  });

  test("a dealbreaker uses the lower of the two time frames", () => {
    const f = [factor("a", { dealbreaker: true, min: 3 })];
    const scores = scoresFrom({ a: { x: [5, 2] } });
    const { rows } = Engine.analyze([option("x")], f, [1], scores, "now");
    assert.equal(rows[0].ruledOut, true);
  });
});

describe("sensitivity analysis", () => {
  test("pet example: fish only wins if 'cuddly' drops from 46% to 12%", () => {
    const { w } = Engine.computeWeights(PET.factors, PET.pairs);
    const r = Engine.robustness("cat", "fish", PET.factors, w, PET.scores, "overall");
    assert.equal(PET.factors[r.factorIndex].id, "cuddly");
    close(r.from, 0.46, 0.01);
    close(r.to, 0.12, 0.01);
    assert.equal(r.level, "solid");
  });

  test("at the suggested weight the two options really do tie", () => {
    const f = [factor("a"), factor("b"), factor("c")];
    const scores = scoresFrom({ a: { x: 5, y: 1 }, b: { x: 2, y: 4 }, c: { x: 3, y: 3 } });
    const w = [0.5, 0.3, 0.2];
    const r = Engine.robustness("x", "y", f, w, scores, "now");
    // Rescale the other weights in proportion, then compare totals
    const k = r.factorIndex;
    const rest = 1 - w[k];
    const w2 = w.map((x, i) => (i === k ? r.to : (x / rest) * (1 - r.to)));
    const total = id => f.reduce((s, fac, i) => s + w2[i] * Engine.score(scores, fac.id, id, "now"), 0);
    close(total("x"), total("y"), 1e-9);
  });

  test("equal totals are reported as a tie", () => {
    const scores = scoresFrom({ a: { x: 3, y: 3 } });
    assert.equal(Engine.robustness("x", "y", [factor("a")], [1], scores, "now").level, "tie");
  });

  test("an option that is better on every factor can't be beaten", () => {
    const f = [factor("a"), factor("b")];
    const scores = scoresFrom({ a: { x: 5, y: 2 }, b: { x: 4, y: 4 } });
    assert.equal(Engine.robustness("x", "y", f, [0.5, 0.5], scores, "now").unbeatable, true);
  });

  test("a small weight change that flips the winner is called fragile", () => {
    const f = [factor("a"), factor("b")];
    const scores = scoresFrom({ a: { x: 5, y: 1 }, b: { x: 1, y: 5 } });
    assert.equal(Engine.robustness("x", "y", f, [0.55, 0.45], scores, "now").level, "fragile");
  });
});

describe("contradiction check", () => {
  const abc = [factor("a"), factor("b"), factor("c")];

  test("a circle of preferences is caught: a > b, b > c, but c > a", () => {
    const conflict = Engine.findConflict(abc, { "a|b": 1, "b|c": 1, "a|c": -1 });
    assert.ok(conflict);
    assert.equal(conflict.gap, 3);
  });

  test("leaving comparisons untouched never triggers a warning", () => {
    // Only one answer given, the rest left on the default Equal
    assert.equal(Engine.findConflict(abc, { "a|b": -1 }), null);
  });

  test("small differences are allowed", () => {
    // a = c, c = b, but a slightly > b: off by one step only
    assert.equal(Engine.findConflict(abc, { "a|c": 0, "b|c": 0, "a|b": 1 }), null);
  });

  test("consistent answers pass", () => {
    assert.equal(Engine.findConflict(abc, { "a|b": 1, "b|c": 1, "a|c": 2 }), null);
  });

  test("the unanswered count is correct", () => {
    assert.deepEqual(Engine.countUnanswered(abc, { "a|b": 0 }), { total: 3, unanswered: 2 });
  });
});

describe("category data", () => {
  for (const [key, c] of Object.entries(CATEGORIES)) {
    test(`${key}: has 10 factors with unique keys and a valid example`, () => {
      assert.equal(c.presets.length, 10);
      assert.equal(new Set(c.presets.map(p => p.key)).size, 10);
      for (const field of ["label", "question", "option", "now", "later", "worst"]) {
        assert.ok(c[field], `missing ${field}`);
      }

      const ex = c.example;
      const n = ex.factors.length, m = ex.options.length;
      ex.factors.forEach(k => assert.ok(c.presets.some(p => p.key === k), `unknown factor ${k}`));
      assert.equal(ex.pairs.length, (n * (n - 1)) / 2);
      ex.pairs.forEach(v => assert.ok([-2, -1, 0, 1, 2].includes(v)));
      assert.equal(ex.grid.length, n);
      ex.grid.forEach(row => {
        assert.equal(row.length, m);
        row.forEach(([a, b]) => assert.ok(a >= 1 && a <= 5 && b >= 1 && b <= 5));
      });
      for (const list of [ex.worst, ex.reverse]) assert.equal(list.length, m);
      assert.ok(ex.lean < m && ex.regret < m);
      if (ex.deal) assert.ok(ex.deal[0] < n && ex.deal[1] >= 1 && ex.deal[1] <= 5);
    });

    test(`${key}: example answers don't contradict each other`, () => {
      const f = c.example.factors.map(id => factor(id));
      const pairs = {};
      let i = 0;
      for (let a = 0; a < f.length; a++) {
        for (let b = a + 1; b < f.length; b++) pairs[f[a].id + "|" + f[b].id] = c.example.pairs[i++];
      }
      assert.equal(Engine.findConflict(f, pairs), null);
    });
  }
});
