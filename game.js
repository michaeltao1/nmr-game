/* NMR practice game: screens, timing, leaderboard and the end-of-round code.
   Plain JavaScript with no libraries. Nothing is stored in the browser and nothing is
   sent anywhere: the only output is the code the player copies by hand. */
(function () {
  "use strict";

  var ITEMS = window.ITEMS || {};
  var CONFIG = window.GAME_CONFIG || { sets: {} };
  var BOARD = window.LEADERBOARD || { status: "demo", sets: {} };

  var POINTS = 10;          // per correct answer
  var CAP = 99;             // seconds per question, so each time fits two digits
  var FALLBACK_MS = 4000;   // start the clock anyway if a spectrum is slow to load
  var LETTERS = ["A", "B", "C", "D"];
  var NUMBERS = ["zero", "one", "two", "three", "four"];
  var DIGITS36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function mmss(s) { return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function ordinal(n) {
    var t = n % 100, u = n % 10;
    var suffix = (t >= 11 && t <= 13) ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th";
    return n + suffix;
  }

  /* ---------- The link: ?set=A&mode=L, ?set=B&mode=S, ?mode=P (optionally &set=A) ---------- */
  var params = new URLSearchParams(window.location.search);
  var mode = (params.get("mode") || "").trim().toUpperCase();
  var set = (params.get("set") || "").trim().toUpperCase();

  function pickQuestions() {
    var sets = CONFIG.sets || {};
    var ids = null;
    if ((mode === "L" || mode === "S") && (set === "A" || set === "B")) ids = sets[set];
    if (mode === "P") {
      if (set === "A" || set === "B") ids = sets[set];
      else if (set === "") ids = (sets.A || []).concat(sets.B || []);
    }
    if (!ids || !ids.length || ids.length % 5) return null;
    if (mode !== "P" && ids.length !== 10) return null;
    var qs = ids.map(function (id) { return ITEMS[id]; });
    return qs.every(Boolean) ? qs : null;
  }

  var questions = pickQuestions();
  var timed = mode === "L" || mode === "S";
  var testers = (BOARD.sets && BOARD.sets[set]) || [];
  var NAME_OK = /^[A-Za-z0-9 '_-]{1,12}$/;

  /* ---------- Round state ---------- */
  var state;
  var token = 0;           // which question the current load/fallback callbacks belong to
  var fallbackTimer = null;

  function freshState() {
    return {
      i: 0, score: 0, correct: [], seconds: [], ranks: [],
      waiting: false, running: false, t0: 0,
      guard: false        // ask before closing the tab
    };
  }

  function show(name) {
    ["start", "play", "result", "broken"].forEach(function (n) {
      $("screen-" + n).hidden = n !== name;
    });
    window.scrollTo(0, 0);
  }

  /* ---------- Start screen ---------- */
  function setupStart() {
    var n = questions.length, spectra = n / 5;
    $("round-line").textContent = mode === "L" ? "This round has a leaderboard."
      : mode === "S" ? "This round has no leaderboard."
      : "Practice mode: no leaderboard and no code.";
    var rules = timed ? [
      "10 questions: two spectra, five steps each, one attempt per question.",
      "10 points per correct answer; the time on each question is recorded.",
      "An explanation appears after each answer.",
      "Tap a spectrum to enlarge it.",
      "Play alone, without notes, and do not refresh or close the tab until you have your code."
    ] : [
      n + " questions: " + (NUMBERS[spectra] || spectra) + " spectra, five steps each, one attempt per question.",
      "10 points per correct answer.",
      "An explanation appears after each answer.",
      "Tap a spectrum to enlarge it."
    ];
    var list = $("rules");
    list.textContent = "";
    rules.forEach(function (r) { list.appendChild(el("li", null, r)); });
    $("demo-banner").hidden = !(mode === "L" && BOARD.status !== "pilot");
    // Start loading every spectrum now, so each question appears without delay.
    questions.forEach(function (q) { var im = new Image(); im.src = q.image; });
  }

  function begin() {
    state = freshState();
    state.guard = timed;
    $("layout").classList.toggle("with-board", mode === "L");
    $("lb-panel").hidden = mode !== "L";
    $("lb-strip").hidden = mode !== "L";
    $("lb-inline").hidden = mode !== "L";
    show("play");
    renderQuestion();
  }

  /* ---------- Questions ---------- */
  function renderQuestion() {
    var q = questions[state.i], n = questions.length;
    $("where").textContent = "Spectrum " + (Math.floor(state.i / 5) + 1) + " of " + (n / 5) +
      " · Step " + (state.i % 5 + 1) + " of 5: " + q.stepName;
    $("score").textContent = "Score " + state.score;
    $("caption").textContent = q.caption;
    $("question").textContent = q.question;
    $("feedback").hidden = true;

    var box = $("answers");
    box.textContent = "";
    box.classList.add("waiting");
    q.options.forEach(function (opt, k) {
      var b = el("button", "answer");
      b.type = "button";
      b.appendChild(el("span", "letter", LETTERS[k]));
      var t = el("span", "text");
      if (Array.isArray(opt)) {
        t.appendChild(el("span", "main", opt[0]));
        t.appendChild(el("span", "sub", opt[1]));
      } else {
        t.textContent = opt;
      }
      b.appendChild(t);
      b.addEventListener("click", function () { choose(k, performance.now()); });
      box.appendChild(b);
    });

    // The clock starts when this spectrum has loaded, or after 4 seconds if it is slow.
    state.waiting = true;
    state.running = false;
    var mine = ++token;
    var img = $("spectrum-img");
    img.onload = img.onerror = function () { if (mine === token) startClock(); };
    img.alt = q.alt;
    img.src = q.image;
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(function () { if (mine === token) startClock(); }, FALLBACK_MS);
    if (img.complete && img.naturalWidth) startClock();

    updateProgress();
    updateClock();
    renderBoard();
  }

  function startClock() {
    if (!state.waiting) return;
    state.waiting = false;
    clearTimeout(fallbackTimer);
    state.t0 = performance.now();
    state.running = true;
    $("answers").classList.remove("waiting");
  }

  function choose(k, t) {
    if (!state.running) return;      // taps before the spectrum has loaded are ignored
    state.running = false;
    var q = questions[state.i];
    var secs = Math.min(CAP, Math.round((t - state.t0) / 1000));
    var ok = k === q.correct;
    state.correct.push(ok ? 1 : 0);
    state.seconds.push(secs);
    if (ok) state.score += POINTS;

    Array.prototype.forEach.call($("answers").children, function (b, j) {
      b.disabled = true;
      b.classList.add(j === q.correct ? "correct" : j === k ? "wrong" : "faded");
    });
    $("verdict").textContent = ok ? "✓ Correct, +10 points" : "✗ Not this time";
    $("feedback").className = "feedback " + (ok ? "good" : "bad");
    $("explanation").textContent = q.explanation;
    $("btn-next").textContent = state.i === questions.length - 1 ? "See my result" : "Next question";
    $("feedback").hidden = false;
    $("score").textContent = "Score " + state.score;
    updateProgress();
    updateClock();
    renderBoard();
    $("btn-next").focus({ preventScroll: true });
    $("feedback").scrollIntoView({ block: "nearest" });
  }

  function next() {
    if ($("screen-play").hidden || $("feedback").hidden) return;
    $("feedback").hidden = true;
    if (state.i < questions.length - 1) {
      state.i += 1;
      renderQuestion();
      window.scrollTo(0, 0);
    } else {
      finish();
    }
  }

  function updateProgress() {
    $("progress-bar").style.width = (100 * state.correct.length / questions.length) + "%";
  }

  function updateClock() {
    if (!state || $("screen-play").hidden) return;
    var current = state.running ? Math.min(CAP, Math.floor((performance.now() - state.t0) / 1000)) : 0;
    $("clock").textContent = mmss(sum(state.seconds) + current);
  }

  /* ---------- Leaderboard: replays the pilot testers' results question by question ---------- */
  function standings(k) {
    var rows = testers.map(function (p, j) {
      return {
        name: NAME_OK.test(p.name || "") ? p.name : "Player " + (j + 1),
        you: false,
        points: POINTS * sum(p.correct.slice(0, k)),
        time: sum(p.seconds.slice(0, k))
      };
    });
    rows.push({ name: "You", you: true, points: POINTS * sum(state.correct.slice(0, k)),
                time: sum(state.seconds.slice(0, k)) });
    // More points first; equal points split by less time; exact ties share a rank, "You" listed first.
    rows.sort(function (a, b) { return b.points - a.points || a.time - b.time || (b.you - a.you); });
    rows.forEach(function (r, j) {
      var prev = rows[j - 1];
      r.rank = prev && prev.points === r.points && prev.time === r.time ? prev.rank : j + 1;
    });
    return rows;
  }

  function moveTag(d) {
    if (d > 0) return el("span", "move up", "▲ up " + d);
    if (d < 0) return el("span", "move down", "▼ down " + (-d));
    return el("span", "move same", "No change");
  }

  function boardNote(k) {
    if (k === 0) return "Everyone starts on 0 points.";
    return "After question " + k + ". Higher points first; equal points are split by faster time. " +
      (BOARD.status === "pilot"
        ? "Other players are Year 2 students who tested the game and agreed to share their scores."
        : "Other players are demo players until the pilot results are loaded.");
  }

  function boardTable(rows) {
    var table = el("table", "lb-table");
    var head = el("tr");
    [["Rank", ""], ["Player", ""], ["Points", "num"], ["Time", "num"]].forEach(function (h) {
      head.appendChild(el("th", h[1], h[0]));
    });
    table.appendChild(el("thead")).appendChild(head);
    var body = table.appendChild(el("tbody"));
    rows.forEach(function (r) {
      var tr = el("tr", r.you ? "you" : null);
      tr.appendChild(el("td", null, String(r.rank)));
      tr.appendChild(el("td", null, r.name));
      tr.appendChild(el("td", "num", String(r.points)));
      tr.appendChild(el("td", "num", mmss(r.time)));
      body.appendChild(tr);
    });
    return table;
  }

  function position(rows, k) {
    var me = rows.filter(function (r) { return r.you; })[0];
    state.ranks[k] = me.rank;
    var p = el("p", "lb-pos");
    p.appendChild(el("strong", null, ordinal(me.rank) + " of " + rows.length));
    if (k >= 2) p.appendChild(moveTag(state.ranks[k - 1] - me.rank));
    return { me: me, el: p };
  }

  function renderBoard() {
    if (mode !== "L") return;
    var k = state.correct.length;
    var rows = standings(k);
    var pos = position(rows, k);

    var panel = $("lb-panel");
    panel.textContent = "";
    panel.appendChild(el("h2", null, "Leaderboard"));
    panel.appendChild(pos.el);
    panel.appendChild(el("p", "lb-note", boardNote(k)));
    panel.appendChild(boardTable(rows));

    var strip = $("lb-strip");
    strip.textContent = "";
    strip.appendChild(el("span", null, "Leaderboard: you are " + ordinal(pos.me.rank) + " of " + rows.length));
    strip.appendChild(el("span", null, pos.me.points + " points"));

    var inline = $("lb-inline");
    inline.textContent = "";
    if (k > 0) {
      inline.appendChild(pos.el.cloneNode(true));
      inline.appendChild(el("p", "lb-note", boardNote(k)));
      inline.appendChild(boardTable(rows));
    }
  }

  /* ---------- Result and code ---------- */
  function checkChars(text) {
    // Each character code times its position, summed, mod 1296, as two base-36 digits.
    var total = 0;
    for (var i = 0; i < text.length; i++) total += (i + 1) * text.charCodeAt(i);
    var v = total % 1296;
    return DIGITS36.charAt(Math.floor(v / 36)) + DIGITS36.charAt(v % 36);
  }

  function makeCode() {
    var body = set + mode + "-" + state.correct.join("") + "-" +
      state.seconds.map(function (s) { return ("0" + s).slice(-2); }).join("");
    return body + "-" + checkChars(body);
  }

  function finish() {
    var n = questions.length;
    $("result-score").textContent = String(state.score);
    $("result-max").textContent = " / " + n * POINTS;
    $("result-line").textContent = sum(state.correct) + " of " + n + " correct in " + mmss(sum(state.seconds));
    $("result-rank").hidden = mode !== "L";
    $("code-block").hidden = !timed;
    $("practice-block").hidden = timed;
    $("copy-status").textContent = "";
    if (timed) {
      $("result-title").textContent = "Round complete";
      $("code").textContent = makeCode();
      if (mode === "L") {
        var rows = standings(n), me = rows.filter(function (r) { return r.you; })[0];
        $("result-rank").textContent = "You finished " + ordinal(me.rank) + " of " + rows.length + " on the leaderboard.";
      }
    } else {
      $("result-title").textContent = "Practice complete";
    }
    show("result");
  }

  function copied() {
    $("copy-status").textContent = "Copied ✓";
    state.guard = false;
  }

  function copyByHand(text) {
    var range = document.createRange();
    range.selectNodeContents($("code"));
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    if (ok) copied();
    else $("copy-status").textContent = "Select the code above and copy it by hand.";
  }

  /* ---------- Enlarged spectrum ---------- */
  function openZoom() {
    var q = questions[state.i];
    $("zoom-img").src = q.image;
    $("zoom-img").alt = q.alt;
    $("zoom").hidden = false;
    document.body.classList.add("noscroll");
    $("btn-zoom-close").focus();
  }

  function closeZoom() {
    $("zoom").hidden = true;
    document.body.classList.remove("noscroll");
    $("btn-zoom").focus({ preventScroll: true });
  }

  /* ---------- Wiring ---------- */
  function init() {
    if (!questions) { show("broken"); return; }
    setupStart();
    show("start");

    $("btn-start").addEventListener("click", begin);
    $("btn-next").addEventListener("click", next);
    $("btn-again").addEventListener("click", begin);
    $("btn-zoom").addEventListener("click", openZoom);
    $("btn-zoom-close").addEventListener("click", closeZoom);
    $("zoom").addEventListener("click", function (ev) { if (ev.target === $("zoom")) closeZoom(); });
    $("btn-copy").addEventListener("click", function () {
      var text = $("code").textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(copied, function () { copyByHand(text); });
      } else {
        copyByHand(text);
      }
    });
    document.addEventListener("copy", function () {
      if (!$("screen-result").hidden) state.guard = false;   // copied by hand
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (!$("zoom").hidden) {
        if (ev.key === "Escape") { ev.preventDefault(); closeZoom(); }
        return;
      }
      if ($("screen-play").hidden) return;
      var key = ev.key || "";
      var k = key.length === 1 ? "1234".indexOf(key) : -1;
      if (k < 0 && key.length === 1) k = "abcd".indexOf(key.toLowerCase());
      if (k >= 0) { ev.preventDefault(); choose(k, performance.now()); return; }
      if (key === "Enter" && !$("feedback").hidden) { ev.preventDefault(); next(); }
    });

    window.addEventListener("beforeunload", function (ev) {
      if (state && state.guard) { ev.preventDefault(); ev.returnValue = ""; }
    });

    setInterval(updateClock, 250);
  }

  init();
})();
