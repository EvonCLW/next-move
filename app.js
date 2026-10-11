"use strict";

// =========================================================
// Settings
// =========================================================
const STORE_KEY = "nextmove:v1";
const STEPS = ["Options", "Factors", "Priorities", "Scores", "Results", "Reflect", "Summary"];
const MAX_FACTORS = 7;

const cat = () => CATEGORIES[state.category] || CATEGORIES.career;

const PAIR_LABELS = ["Much more", "More", "Equal", "More", "Much more"];
const PAIR_VALUES = [2, 1, 0, -1, -2];

const REVERSIBILITY = { easy: "Easy to undo", costly: "Possible, but costly", hard: "Hard to undo" };

// =========================================================
// State (everything the user has entered)
// =========================================================
function blankState() {
  return {
    step: 1,
    category: "career",
    question: "",
    options: [],          // [{ id, name }]
    lean: "",             // option id
    factors: [],          // [{ id, name, desc, dealbreaker, min }]
    pairs: {},            // { "factorA|factorB": -2..2 }
    scores: {},           // { factorId: { optionId: { now, later } } }
    view: "overall",
    reflect: { regret: "", worst: {}, reverse: {} }
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved ? Object.assign(blankState(), saved) : null;
  } catch (e) { return null; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

let state = loadState() || blankState();
const newId = () => Math.random().toString(36).slice(2, 9);
const optName = o => o.name.trim() || "Untitled option";
const findOpt = id => state.options.find(o => o.id === id);

// ---------- Scores ----------
// Creates the score entry when the user changes a score
function cell(fid, oid) {
  if (!state.scores[fid]) state.scores[fid] = {};
  if (!state.scores[fid][oid]) state.scores[fid][oid] = { now: 3, later: null };
  return state.scores[fid][oid];
}
const nowScore = (fid, oid) => Engine.score(state.scores, fid, oid, "now");
const laterScore = (fid, oid) => Engine.score(state.scores, fid, oid, "later");

// =========================================================
// Connecting the page to the maths in engine.js
// =========================================================
const computeWeights = () => Engine.computeWeights(state.factors, state.pairs);

function analyze(view) {
  const { w } = computeWeights();
  const { rows, eligible } = Engine.analyze(state.options, state.factors, w, state.scores, view);
  rows.forEach(r => {
    r.name = optName(r.opt);
    r.reasons = r.reasons.map(x => `${x.factor.name} scores ${x.lowest}, below your minimum of ${x.min}`);
  });
  return { rows, eligible, w };
}

function robustness(a, b, w, view) {
  const r = Engine.robustness(a.opt.id, b.opt.id, state.factors, w, state.scores, view);
  if (r.factorIndex != null) r.factor = state.factors[r.factorIndex];
  return r;
}

const pct = x => Math.round(x * 100) + "%";

// =========================================================
// Small helpers for building the page
// =========================================================
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  children.forEach(c => { if (c != null) node.append(c); });
  return node;
}
const $ = id => document.getElementById(id);

// A row of radio buttons styled as a segmented picker
function picker(groupName, values, labels, current, onPick, ariaLabel, wide) {
  const wrap = el("div", { class: "scale" + (wide ? " wide" : ""), role: "radiogroup", "aria-label": ariaLabel });
  values.forEach((v, i) => {
    const id = groupName + "-" + i;
    wrap.append(
      el("input", { type: "radio", name: groupName, id, checked: v === current, onchange: () => onPick(v) }),
      el("label", { for: id }, labels[i])
    );
  });
  return wrap;
}
const ONE_TO_FIVE = [1, 2, 3, 4, 5];
const ONE_TO_FIVE_LABELS = ["1", "2", "3", "4", "5"];

function bar(name, value, label, extraClass, reasons) {
  const fill = el("div", { class: "bar-fill", style: "width:0%" });
  requestAnimationFrame(() => { fill.style.width = Math.max(0, Math.min(100, value)) + "%"; });
  return el("div", { class: "bar-row " + (extraClass || "") },
    el("div", { class: "bar-label" }, el("span", {}, name), el("span", {}, label)),
    el("div", { class: "bar-track" }, fill),
    reasons && reasons.length ? el("ul", { class: "reasons" }, ...reasons.map(r => el("li", {}, r))) : null
  );
}

function warnNote(title, text) {
  const box = note(title, text);
  box.classList.add("warn");
  return box;
}

function note(title, text) {
  return el("div", { class: "note" }, title ? el("strong", {}, title) : null, text);
}

// =========================================================
// Step 1: options
// =========================================================
function renderOptions() {
  const chips = $("catChips");
  chips.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, c]) => {
    chips.append(el("button", { type: "button", class: "chip", "aria-pressed": String(state.category === key),
      onclick: () => { state.category = key; saveState(); renderOptions(); } }, c.label));
  });
  $("question").placeholder = cat().question;
  $("newOption").placeholder = cat().option;
  $("question").value = state.question;
  const list = $("optionList");
  list.innerHTML = "";
  if (!state.options.length) list.append(el("p", { class: "empty" }, "No options yet. Add at least two."));
  state.options.forEach(o => {
    list.append(el("div", { class: "row" },
      el("input", { type: "text", value: o.name, "aria-label": "Option name",
        oninput: e => { o.name = e.target.value; renderLean(); saveState(); } }),
      el("button", { type: "button", class: "quiet", onclick: () => removeOption(o.id) }, "Remove")
    ));
  });
  renderLean();
}

function renderLean() {
  const sel = $("lean");
  sel.innerHTML = "";
  sel.append(el("option", { value: "" }, "Not sure yet"));
  state.options.forEach(o => sel.append(el("option", { value: o.id, selected: o.id === state.lean }, optName(o))));
}

function addOption() {
  const input = $("newOption");
  const name = input.value.trim();
  if (!name) return input.focus();
  state.options.push({ id: newId(), name });
  input.value = "";
  renderOptions(); saveState(); input.focus();
}

function addYesNo() {
  ["Yes, do it", "No, don't"].forEach(name => {
    if (!state.options.some(o => o.name === name)) state.options.push({ id: newId(), name });
  });
  renderOptions(); saveState();
}

function removeOption(id) {
  state.options = state.options.filter(o => o.id !== id);
  Object.values(state.scores).forEach(row => delete row[id]);
  if (state.lean === id) state.lean = "";
  if (state.reflect.regret === id) state.reflect.regret = "";
  renderOptions(); saveState();
}

// =========================================================
// Step 2: factors and dealbreakers
// =========================================================
function renderFactors() {
  const chips = $("chips");
  chips.innerHTML = "";
  const full = state.factors.length >= MAX_FACTORS;
  const noteBox = $("catNote");
  noteBox.innerHTML = "";
  if (cat().note) noteBox.append(el("div", { class: "note", style: "margin:0 0 16px" }, cat().note));
  cat().presets.forEach(p => {
    const on = state.factors.some(f => f.id === "p-" + p.key);
    chips.append(el("button", { type: "button", class: "chip", "aria-pressed": String(on), disabled: !on && full,
      title: p.desc, onclick: () => on ? removeFactor("p-" + p.key) : addFactor({ id: "p-" + p.key, name: p.name, desc: p.desc }) }, p.name));
  });
  $("addFactor").disabled = full;

  const list = $("factorList");
  list.innerHTML = "";
  if (!state.factors.length) {
    list.append(el("p", { class: "empty" }, "Choose some factors above first."));
    return;
  }
  state.factors.forEach(f => {
    const minPicker = f.dealbreaker
      ? el("span", { class: "deal" }, "Must score at least",
          picker("min-" + f.id, ONE_TO_FIVE, ONE_TO_FIVE_LABELS, f.min, v => { f.min = v; saveState(); }, "Minimum for " + f.name))
      : null;
    list.append(el("div", { class: "factor-item" },
      el("div", { class: "factor-head" },
        el("span", {}, f.name),
        el("button", { type: "button", class: "quiet", onclick: () => removeFactor(f.id) }, "Remove")),
      f.desc ? el("p", { class: "factor-desc" }, f.desc) : null,
      el("div", { class: "deal" },
        el("label", {},
          el("input", { type: "checkbox", checked: f.dealbreaker,
            onchange: e => { f.dealbreaker = e.target.checked; renderFactors(); saveState(); } }),
          " This is a dealbreaker"),
        minPicker)
    ));
  });
}

function addFactor(factor) {
  if (state.factors.length >= MAX_FACTORS) return;
  state.factors.push({ desc: "", dealbreaker: false, min: 3, ...factor });
  renderFactors(); saveState();
}

function addCustomFactor() {
  const input = $("newFactor");
  const name = input.value.trim();
  if (!name) return input.focus();
  addFactor({ id: newId(), name });
  input.value = "";
  input.focus();
}

function removeFactor(id) {
  state.factors = state.factors.filter(f => f.id !== id);
  delete state.scores[id];
  Object.keys(state.pairs).forEach(k => { if (k.split("|").includes(id)) delete state.pairs[k]; });
  renderFactors(); saveState();
}

// =========================================================
// Step 3: pairwise priorities
// =========================================================
function renderPairs() {
  const list = $("pairList");
  list.innerHTML = "";
  const f = state.factors;
  if (f.length < 2) {
    list.append(el("p", { class: "empty" }, "Choose at least two factors to compare."));
    renderWeights();
    return;
  }
  for (let i = 0; i < f.length; i++) {
    for (let j = i + 1; j < f.length; j++) {
      const key = f[i].id + "|" + f[j].id;
      list.append(el("div", { class: "pair", "data-key": key },
        el("div", { class: "pair-names" }, el("span", {}, f[i].name), el("span", {}, f[j].name)),
        picker("pair-" + i + "-" + j, PAIR_VALUES, PAIR_LABELS, state.pairs[key] || 0,
          v => { state.pairs[key] = v; renderWeights(); saveState(); },
          `Which matters more: ${f[i].name} or ${f[j].name}`, true)
      ));
    }
  }
  renderWeights();
}

function renderWeights() {
  const area = $("weightArea");
  area.innerHTML = "";
  if (!state.factors.length) return;
  const { w } = computeWeights();
  area.append(el("h3", { style: "margin-bottom:12px" }, "How much each factor counts"));
  state.factors
    .map((f, i) => ({ f, w: w[i] }))
    .sort((a, b) => b.w - a.w)
    .forEach(x => area.append(bar(x.f.name, x.w * 100, pct(x.w))));

  // Untouched comparisons count as Equal; say so, so nobody is surprised
  const { total, unanswered } = Engine.countUnanswered(state.factors, state.pairs);
  if (unanswered > 0) {
    area.append(el("p", { class: "hint", style: "margin-top:14px" },
      `${unanswered} of ${total} comparisons haven't been answered yet, so they count as Equal.`));
  }

  // Contradictions: only between answers the user actually chose
  const conflict = Engine.findConflict(state.factors, state.pairs);
  const conflictKeys = [];
  if (conflict) {
    const F = state.factors;
    const A = F[conflict.a], B = F[conflict.b], C = F[conflict.c];
    const implied = Math.max(-2, Math.min(2, conflict.ab + conflict.bc));
    area.append(warnNote("Three of your answers don't fit together",
      `You said ${said(A.name, B.name, conflict.ab)}, and ${said(B.name, C.name, conflict.bc)}. ` +
      `That suggests ${said(A.name, C.name, implied, true)}, but you also said ${said(A.name, C.name, conflict.ac)}. ` +
      `The three answers are highlighted above. Changing any one of them will fix this.`));
    [[A, B], [B, C], [A, C]].forEach(([x, y]) => conflictKeys.push(x.id + "|" + y.id, y.id + "|" + x.id));
  }
  document.querySelectorAll("#pairList .pair").forEach(row => {
    row.classList.toggle("conflict", conflictKeys.includes(row.dataset.key));
  });
}

// Puts a pairwise answer into words, e.g. "salary matters more than benefits"
function said(a, b, v, rough) {
  if (v === 0) return rough ? `${a} and ${b} matter about equally` : `${a} and ${b} matter equally`;
  const [big, small] = v > 0 ? [a, b] : [b, a];
  return `${big} matters ${Math.abs(v) === 2 ? "much more" : "more"} than ${small}`;
}

// =========================================================
// Step 4: scores
// =========================================================
function renderScores() {
  const area = $("scoreArea");
  area.innerHTML = "";
  if (!state.options.length || !state.factors.length) {
    area.append(el("p", { class: "empty" }, "Add your options (step 1) and factors (step 2) first."));
    return;
  }
  state.options.forEach(o => {
    const block = el("div", { class: "opt-block" }, el("h3", {}, optName(o)));
    state.factors.forEach(f => {
      const laterGroup = "l-" + f.id + "-" + o.id;
      block.append(el("div", { class: "score-row" },
        el("span", {}, f.name),
        el("div", { class: "score-pickers" },
          el("div", {}, cat().now,
            picker("n-" + f.id + "-" + o.id, ONE_TO_FIVE, ONE_TO_FIVE_LABELS, nowScore(f.id, o.id), v => {
              const c = cell(f.id, o.id);
              c.now = v;
              if (c.later == null) $(laterGroup + "-" + (v - 1)).checked = true; // keep copying until changed
              saveState();
            }, `${f.name}, ${optName(o)}, ${cat().now}`)),
          el("div", {}, cat().later,
            picker(laterGroup, ONE_TO_FIVE, ONE_TO_FIVE_LABELS, laterScore(f.id, o.id), v => {
              cell(f.id, o.id).later = v; saveState();
            }, `${f.name}, ${optName(o)}, ${cat().later}`))
        )
      ));
    });
    area.append(block);
  });
}

// =========================================================
// Step 5: results
// =========================================================
const timeHint = (label, generic) => label === generic ? "" : ` (${label.toLowerCase()})`;
const viewLabels = () => ({ now: cat().now, later: cat().later, overall: "Overall" });

function renderResults() {
  const area = $("resultArea");
  area.innerHTML = "";
  if (state.options.length < 2 || !state.factors.length) {
    area.append(el("p", { class: "empty" }, "You need at least two options and one factor to see results."));
    return;
  }

  const tabs = el("div", { class: "tabs", role: "group", "aria-label": "Time frame" });
  Object.entries(viewLabels()).forEach(([v, label]) => {
    tabs.append(el("button", { type: "button", "aria-pressed": String(state.view === v),
      onclick: () => { state.view = v; saveState(); renderResults(); } }, label));
  });
  area.append(tabs);

  const view = state.view;
  const { rows, eligible, w } = analyze(view);
  const winner = eligible[0];
  const runner = eligible[1];

  const verdict = el("p", { class: "verdict" });
  if (!winner) verdict.append("Every option breaks at least one dealbreaker");
  else if (runner && Math.abs(winner.val - runner.val) < 1e-9) verdict.append("It's a tie between ", el("mark", {}, winner.name), " and ", el("mark", {}, runner.name));
  else verdict.append(el("mark", {}, winner.name), " comes out ahead");
  area.append(verdict);

  rows.forEach((r, i) => {
    const cls = r.ruledOut ? "out" : (r === winner ? "winner" : "");
    area.append(bar(r.name, r.pct, r.ruledOut ? "Ruled out" : r.pct + "%", cls, r.reasons));
  });

  if (!winner) {
    area.append(note("What now?", "Either your minimums are too strict, or you need a new option. Both are worth knowing."));
    return;
  }
  if (!runner) {
    area.append(note("Only one option survives", `${winner.name} is the only option that meets all your dealbreakers.`));
  } else {
    const rb = robustness(winner, runner, w, view);
    if (rb.level === "tie") {
      area.append(note("A genuine tie", "Try the coin flip test: imagine a coin picks one. If you feel disappointed, that tells you what you really want."));
    } else if (rb.unbeatable) {
      area.append(note("Very solid result", `${winner.name} scores as well as or better than ${runner.name} on every factor. No change in priorities would flip this.`));
    } else {
      const titles = { fragile: "A close call", moderate: "A fairly clear result", solid: "A solid result" };
      area.append(note(titles[rb.level],
        `${runner.name} would only win if ${rb.factor.name} counted for ${pct(rb.to)} of your decision instead of ${pct(rb.from)}.` +
        (rb.level === "fragile" ? " That's a small shift, so think hard about how much that factor really matters." : "")));
    }
  }

  // Do the two time frames disagree?
  const nowWin = analyze("now").eligible[0];
  const laterWin = analyze("later").eligible[0];
  if (nowWin && laterWin && nowWin.opt.id !== laterWin.opt.id) {
    area.append(note("Short term vs. long term",
      `${nowWin.name} looks best in the short term${timeHint(cat().now, "Short term")}, but ${laterWin.name} pulls ahead in the long term${timeHint(cat().later, "Long term")}. Ask yourself which time frame matters more right now.`));
  }
}

// =========================================================
// Step 6: reflection
// =========================================================
function renderReflect() {
  const area = $("reflectArea");
  area.innerHTML = "";
  if (!state.options.length) {
    area.append(el("p", { class: "empty" }, "Add your options in step 1 first."));
    return;
  }
  const regret = el("select", { id: "regret", onchange: e => { state.reflect.regret = e.target.value; saveState(); } },
    el("option", { value: "" }, "Choose one"),
    ...state.options.map(o => el("option", { value: o.id, selected: state.reflect.regret === o.id }, optName(o))));
  area.append(
    el("label", { class: "field", for: "regret" }, "The regret test"),
    el("p", { class: "hint" }, "Imagine you're 80, looking back. Which path would you most regret not taking?"),
    regret
  );

  state.options.forEach(o => {
    const worstId = "worst-" + o.id, revId = "rev-" + o.id;
    const rev = el("select", { id: revId, onchange: e => { state.reflect.reverse[o.id] = e.target.value; saveState(); } },
      el("option", { value: "" }, "Choose one"),
      ...Object.entries(REVERSIBILITY).map(([k, label]) => el("option", { value: k, selected: state.reflect.reverse[o.id] === k }, label)));
    const worst = el("textarea", { id: worstId, placeholder: cat().worst,
      oninput: e => { state.reflect.worst[o.id] = e.target.value; saveState(); } });
    worst.value = state.reflect.worst[o.id] || "";
    area.append(
      el("h3", { style: "margin-top:28px" }, optName(o)),
      el("label", { class: "field", for: worstId }, "What's the worst realistic outcome?"),
      worst,
      el("label", { class: "field", for: revId }, "If it goes wrong, how easy is it to undo?"),
      rev
    );
  });
}

// =========================================================
// Step 7: summary
// =========================================================
function renderSummary() {
  const area = $("summaryArea");
  area.innerHTML = "";
  if (state.options.length < 2 || !state.factors.length) {
    area.append(el("p", { class: "empty" }, "Complete the earlier steps to see your summary."));
    return;
  }
  const { rows, eligible, w } = analyze("overall");
  const winner = eligible[0];
  const lean = findOpt(state.lean);
  const regret = findOpt(state.reflect.regret);
  const top = state.factors.map((f, i) => ({ f, w: w[i] })).sort((a, b) => b.w - a.w).slice(0, 3);
  const nowWin = analyze("now").eligible[0];
  const laterWin = analyze("later").eligible[0];

  let strength = "";
  if (winner && eligible[1]) {
    const rb = robustness(winner, eligible[1], w, "overall");
    strength = { tie: "a tie", fragile: "a close call", moderate: "fairly clear", solid: "solid" }[rb.level];
  }

  const dl = el("dl", {},
    el("dt", {}, "Decision"), el("dd", {}, state.question || "Untitled decision"),
    el("dt", {}, "What mattered most"), el("dd", {}, top.map(x => `${x.f.name} (${pct(x.w)})`).join(", ")),
    el("dt", {}, "Analysis result"),
    el("dd", {}, winner ? `${winner.name}, ${winner.pct}%${strength ? ` (${strength})` : ""}` : "No option met all dealbreakers"),
    el("dt", {}, "Ruled out"),
    el("dd", {}, rows.filter(r => r.ruledOut).map(r => r.name).join(", ") || "None"),
    el("dt", {}, `Best ${cat().now.toLowerCase()} / ${cat().later.toLowerCase()}`),
    el("dd", {}, `${nowWin ? nowWin.name : "None"} / ${laterWin ? laterWin.name : "None"}`),
    el("dt", {}, "Your first instinct"), el("dd", {}, lean ? optName(lean) : "Not sure"),
    el("dt", {}, "The regret test"), el("dd", {}, regret ? optName(regret) : "Not answered")
  );
  if (winner) {
    const rev = REVERSIBILITY[state.reflect.reverse[winner.opt.id]];
    const worst = (state.reflect.worst[winner.opt.id] || "").trim().replace(/[.\s]+$/, "");
    dl.append(
      el("dt", {}, `If ${winner.name} goes wrong`),
      el("dd", {}, (worst || "Worst case not written yet") + (rev ? `. ${rev}.` : ""))
    );
  }
  area.append(dl);

  // Bring head, gut and regret together
  const lines = [];
  if (winner) {
    const signals = [lean, regret].filter(Boolean);
    const agree = signals.length && signals.every(s => s.id === winner.opt.id);
    if (agree && signals.length === 2) {
      lines.push(`Your analysis, your first instinct and the regret test all point to ${winner.name}. That's a strong signal.`);
    } else {
      lines.push(`Your analysis favours ${winner.name}.`);
      if (lean && lean.id !== winner.opt.id) lines.push(`Your first instinct was ${optName(lean)}. When head and gut disagree, the gut is often reacting to something not on your list. Ask yourself what ${optName(lean)} offers that your factors missed.`);
      if (regret && regret.id !== winner.opt.id) lines.push(`The regret test points to ${optName(regret)}, which suggests it connects to something you care about long-term.`);
      if (lean && lean.id === winner.opt.id) lines.push("It also matches your first instinct.");
      if (regret && regret.id === winner.opt.id) lines.push("The regret test agrees, which suggests it connects to what you care about long-term.");
    }
    const rev = state.reflect.reverse[winner.opt.id];
    if (rev === "easy") lines.push(`${winner.name} is easy to undo, so the cost of trying it is low.`);
    if (rev === "hard") lines.push(`${winner.name} is hard to undo, so it's worth talking it through with someone you trust before committing.`);
  } else {
    lines.push("None of your options meets all your dealbreakers. Consider loosening a minimum or looking for a new option.");
  }
  area.append(el("div", { class: "takeaway" }, el("h3", { style: "margin-bottom:6px" }, "Takeaway"), ...lines.map(t => el("p", { style: "margin:6px 0" }, t))));
}

// =========================================================
// Navigation
// =========================================================
const RENDERERS = [null, renderOptions, renderFactors, renderPairs, renderScores, renderResults, renderReflect, renderSummary];

function goTo(step) {
  state.step = Math.max(1, Math.min(STEPS.length, step));
  saveState();
  renderStepper();
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", Number(p.dataset.step) === state.step));
  RENDERERS[state.step]();
  $("backBtn").disabled = state.step === 1;
  $("nextBtn").disabled = state.step === STEPS.length;
}

function renderStepper() {
  const nav = $("stepper");
  nav.innerHTML = "";
  STEPS.forEach((name, i) => {
    nav.append(el("li", {}, el("button", { type: "button", "aria-current": state.step === i + 1 ? "step" : false,
      onclick: () => goTo(i + 1) }, `${i + 1}. ${name}`)));
  });
}

// =========================================================
// Example data
// =========================================================
function loadExample() {
  const key = state.category in CATEGORIES ? state.category : "career";
  const c = CATEGORIES[key], ex = c.example;

  const o = ex.options.map(name => ({ id: newId(), name }));
  const f = ex.factors.map(k => {
    const p = c.presets.find(x => x.key === k);
    return { id: "p-" + k, name: p.name, desc: p.desc, dealbreaker: false, min: 3 };
  });
  if (ex.deal) { f[ex.deal[0]].dealbreaker = true; f[ex.deal[0]].min = ex.deal[1]; }

  // Pair answers are listed in order 0-1, 0-2, ... 3-4
  const pairs = {};
  let n = 0;
  for (let i = 0; i < f.length; i++) {
    for (let j = i + 1; j < f.length; j++) pairs[f[i].id + "|" + f[j].id] = ex.pairs[n++];
  }

  const scores = {};
  f.forEach((fac, fi) => {
    scores[fac.id] = {};
    o.forEach((opt, oi) => { scores[fac.id][opt.id] = { now: ex.grid[fi][oi][0], later: ex.grid[fi][oi][1] }; });
  });

  const byOption = list => Object.fromEntries(o.map((opt, i) => [opt.id, list[i]]));
  state = {
    step: 5, category: key,
    question: ex.question,
    options: o, lean: o[ex.lean].id, factors: f, pairs, scores, view: "overall",
    reflect: { regret: o[ex.regret].id, worst: byOption(ex.worst), reverse: byOption(ex.reverse) }
  };
  goTo(5);
}

// =========================================================
// Start
// =========================================================
$("question").addEventListener("input", e => { state.question = e.target.value; saveState(); });
$("addOption").addEventListener("click", addOption);
$("newOption").addEventListener("keydown", e => { if (e.key === "Enter") addOption(); });
$("lean").addEventListener("change", e => { state.lean = e.target.value; saveState(); });
$("addFactor").addEventListener("click", addCustomFactor);
$("newFactor").addEventListener("keydown", e => { if (e.key === "Enter") addCustomFactor(); });
$("backBtn").addEventListener("click", () => { goTo(state.step - 1); window.scrollTo(0, 0); });
$("nextBtn").addEventListener("click", () => { goTo(state.step + 1); window.scrollTo(0, 0); });
$("exampleBtn").addEventListener("click", loadExample);
$("yesNoBtn").addEventListener("click", addYesNo);
$("resetBtn").addEventListener("click", () => {
  if (confirm("Clear everything and start a new decision?")) { const keep = state.category; state = blankState(); state.category = keep; goTo(1); }
});

goTo(state.step);
