"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const pageOptions = new URLSearchParams(window.location.search);
  const filmMode = pageOptions.get("film") === "1";
  const captureMode = filmMode && pageOptions.get("capture") === "1";
  const CAST = {
    prosecutor: { name: "Ada Voss", role: "Prosecution", color: "#d79365", pitch: 1.08, rate: 1.02 },
    defense: { name: "Victor Hale", role: "Defense", color: "#8aafbd", pitch: .9, rate: 1.04 },
    witness: { name: "Maya Chen", role: "Expert witness", color: "#9fc6a6", pitch: 1.16, rate: .97 },
    judge: { name: "Judge Rao", role: "Presiding judge", color: "#c7afcc", pitch: .78, rate: .88 },
  };
  const state = { variant: "baseline", mode: null, originMode: null, trial: null, index: -1, playing: false, finished: false, timer: null, pollTimer: null, pollGeneration: 0, startPending: false, waitingForStep: false, status: null, voices: [], voiceMap: {}, voiceEnabled: false, speechToken: 0, toastTimer: null, evidenceKey: "" };
  Object.assign(state, { captionChunks: [], captionIndex: 0, captionTimer: null, captionToken: 0, captionElapsed: 0, captionStartedAt: 0, captionDuration: 0, captionHasBoundary: false, captionTextLength: 0 });

  function character(id) {
    const isJudge = id === "judge", isWitness = id === "witness", isDefense = id === "defense";
    const skin = isJudge ? "#ae7854" : isWitness ? "#b47b58" : isDefense ? "#ddba98" : "#c58b68";
    const shade = isJudge ? "#875237" : isWitness ? "#8e543c" : isDefense ? "#b99173" : "#985c45";
    const suit = isJudge ? "#37363e" : isWitness ? "#435a4b" : isDefense ? "#344553" : "#85483b";
    const darkSuit = isJudge ? "#24262e" : isWitness ? "#2c3e33" : isDefense ? "#23313e" : "#5b302a";
    const shirt = isJudge ? "#e4d9ba" : isWitness ? "#b1bc91" : isDefense ? "#d3d7cb" : "#e9dbc1";
    const hair = isJudge ? `<path d="M111 105c-19-38 2-71 38-74 35-4 64 18 61 56l-15 20-9-32-58 1-3 35Z" fill="#c7c2af"/><path d="M109 98c-3 19 3 35 16 40l-1-36M207 96c4 21-5 35-14 41l-1-35" fill="#e5dcc7"/>` : isWitness ? `<path d="M104 112c-20-23-10-61 12-72-6-24 17-42 38-33 14-17 39-9 42 10 27 0 36 29 20 46 13 14 10 38-8 57l-18-41-65 2-9 39Z" fill="#252921"/><path d="M118 50c18-9 52-13 77 10" stroke="#424636" stroke-width="5"/>` : isDefense ? `<path d="M104 102c-7-25-4-51 23-67 23-15 63-3 74 17l10 32-15 18-4-34-22-11-46 18-9 31Z" fill="#9a9d90"/><path d="m114 65 28-18 45 2-25 9-37 23" fill="#d5d6c4"/><path d="m191 64 17 25-13 18Z" fill="#6a746a"/>` : `<path d="M104 132c-18-46-2-92 36-101 42-10 69 22 64 67l-8 42-16-20 3-47-16-19-42 24 3 49-15 17Z" fill="#242924"/><path d="m112 74 23-28 28-4-18 19-30 19" fill="#3b4034"/>`;
    const glasses = isWitness ? `<g fill="none" stroke="#302d22" stroke-width="3"><path d="M122 99h28v20h-28zM164 99h28v20h-28zM150 106h14M118 104l-7-3M192 104l9-3"/></g>` : isDefense ? `<path d="m120 100 26-3M170 98l23 5" stroke="#6a6856" stroke-width="2.5"/>` : "";
    const judgeBeard = isJudge ? `<path d="M130 138c7 2 15-5 25-4 12-1 18 7 25 4l-4 13-19 15-20-13Z" fill="#d3cab4"/><path d="m135 139 19-3 22 4" stroke="#938771" stroke-width="2"/>` : "";
    const garment = isJudge ? `<path d="m110 184 37-14h28l38 14 35 72-15 175H88L73 257Z" fill="${suit}"/><path d="m145 170 14 31 17-31 21 28-24 69h-27l-23-69Z" fill="${shirt}"/><path d="m159 201-3 139M128 233l-14 189M190 233l14 189" stroke="${darkSuit}" stroke-width="5"/><path d="M87 426h147l-10 65H96Z" fill="${darkSuit}"/>` : `<path d="m107 185 40-17h27l39 17 19 168-10 66H97l-10-65Z" fill="${suit}"/><path d="m144 170 15 18 18-18 13 32-28 88-30-88Z" fill="${shirt}"/><path d="m130 175-28 24 30 52 16-17-9 76 20 47-6-151Z" fill="${darkSuit}"/><path d="m181 174 29 26-29 52-17-18 1 122-7 11 2-162Z" fill="${suit}" stroke="${darkSuit}" stroke-width="2"/>${isWitness ? `<path d="m145 186 16 23 15-22-9 112h-15Z" fill="#82986d"/>` : `<path d="m153 192 9-6 10 8-9 18 12 61-15 20-12-20 6-60Z" fill="${isDefense ? "#9b7650" : "#454c3e"}"/>`}<path d="M98 408h124l-12 93h-48l-3-68-5 68h-48Z" fill="${darkSuit}"/><path d="m106 492-13 17v9h61v-23M165 495v23h62v-9l-18-15" fill="#1c241f"/><path d="M107 358h113" stroke="#c2aa7655" stroke-width="2"/><path d="M171 321h25M113 321h24" stroke="${darkSuit}" stroke-width="3"/>`;
    return `<svg class="character-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 520" fill="none"><ellipse cx="159" cy="512" rx="78" ry="7" fill="#0c1611" opacity=".4"/>${garment}<g class="arm-rest"><path d="m110 188-21 14-27 105 27 65 22-9-19-63 26-77Z" fill="${suit}"/><path d="m89 350 21 12 6 27-9 14-10-8-8-19-10-13Z" fill="${skin}"/><path d="m92 363 10 21" stroke="${shade}" stroke-width="2"/></g><g class="arm-gesture"><path d="m210 185 22 13 18 95-15 55-25-7 13-54-29-65Z" fill="${suit}"/><path d="m211 328 25 7-3 18-25-7Z" fill="${shirt}"/><path d="m210 343 22 5 2 23-9 16-13-4-7-20Z" fill="${skin}"/><path d="m218 353 3 23M224 353l2 18" stroke="${shade}" stroke-width="2"/><g class="hand-evidence"><path d="m208 337 39 11-20 77-39-12Z" fill="#d5d4b7" stroke="#363e2d" stroke-width="2"/><path d="m210 351 26 7M207 361l22 6M204 371l24 6M202 381l16 4" stroke="#6c785d" stroke-width="2"/></g><g class="hand-point"><path d="m217 351 8-12 3-30c1-8 10-8 11 0l-1 25 12 16-9 20-15 5-13-9Z" fill="${skin}" stroke="${shade}" stroke-width="1.5"/></g><g class="gavel"><path d="m216 335 10 3-16 80-10-2Z" fill="#936b3c"/><path d="m194 327 49 10-7 26-49-10Z" fill="#b88d4c" stroke="#684f2c" stroke-width="3"/><path d="m202 331-5 23M234 338l-5 22" stroke="#dab976" stroke-width="2"/></g></g><path d="M145 145h31v34l-16 18-17-18Z" fill="${skin}"/><path d="m145 148 31 2v13l-31 7Z" fill="${shade}"/><g class="character-head">${hair}<path d="M118 82c0-27 77-28 78 2l-5 48-15 22-17 7-20-8-17-22Z" fill="${skin}"/><path d="M119 95c-13-11-18 1-10 18l11 9M194 95c13-11 16 1 9 18l-11 9" fill="${skin}"/><path d="M180 80 174 136l-16 24 18-6 15-22 5-49Z" fill="${shade}" opacity=".55"/><path d="m127 94 19-3M169 92l19 4" stroke="#303327" stroke-width="3" stroke-linecap="round"/><path d="M126 105q10-8 20 0-9 9-20 0ZM170 105q10-8 19 1-10 8-19-1Z" fill="#ece3c5"/><ellipse cx="137" cy="105" rx="3.2" ry="4.1" fill="#283b2d"/><ellipse cx="180" cy="105" rx="3.2" ry="4.1" fill="#283b2d"/><path d="M126 104q10-6 20 1M170 104q10-5 19 2" stroke="#303327" stroke-width="1.8"/><path d="m157 103-5 19 10 1" stroke="${shade}" stroke-width="2" stroke-linecap="round"/><path d="m140 132 18 3 17-4" class="mouth-closed" stroke="#634633" stroke-width="2" stroke-linecap="round"/><path d="M144 130c10 2 17 2 25-1l-4 12-14 1Z" class="mouth-open" fill="#563a2b"/><path d="m144 130 25-1-3 4h-21Z" class="mouth-open" fill="#e6d8b5"/>${glasses}${judgeBeard}${!isWitness && !isDefense && !isJudge ? `<path d="M115 86c5-26 12-36 51-34l-39 31 2 38-14 20Z" fill="#252b25"/><path d="m185 62 13 22-3 46-11 12Z" fill="#252b25"/><path d="M120 121v17" stroke="#c7a66a" stroke-width="3"/>` : ""}${isJudge ? `<path d="m124 79 16-5M174 75l16 7" stroke="#d1c7ad" stroke-width="4"/>` : ""}</g>${!isJudge ? `<path d="m111 206 5 6-5 6-5-6Z" fill="#c6ad76"/>` : ""}</svg>`;
  }

  $("cast").innerHTML = Object.keys(CAST).map((id) => `<div class="performer performer-${id}" data-agent="${id}">${character(id)}</div>`).join("");

  function toast(message) {
    clearTimeout(state.toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    state.toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000);
  }

  async function request(path, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, { ...options, signal: controller.signal, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || body.message || `Request failed (${response.status}).`);
      return body;
    } finally { clearTimeout(timer); }
  }

  function setToolStatus(id, text, connected) {
    const element = $(id);
    element.querySelector("b").textContent = text;
    element.classList.toggle("connected", connected);
  }

  async function loadStatus() {
    try {
      const status = await request("/api/status", {}, 5000);
      state.status = status;
      const modelReady = Boolean(status.model_configured);
      $("connectionState").classList.toggle("ready", modelReady);
      $("connectionState").innerHTML = `<i></i>${modelReady ? (status.model_verified ? "Model verified" : "Model ready") : "Visual rehearsal available"}`;
      setToolStatus("modelStatus", modelReady ? (status.model_verified ? "Verified" : "Ready") : "Not configured", modelReady);
      setToolStatus("bruinStatus", status.bruin?.available ? "Available" : "Unavailable", Boolean(status.bruin?.available));
      setToolStatus("bandStatus", status.band?.connected ? "Connected" : status.band?.configured ? "Configured" : "Not configured", Boolean(status.band?.connected));
      setToolStatus("telemStatus", status.telem?.configured ? "Configured" : "Not configured", Boolean(status.telem?.configured));
      $("startHelp").textContent = modelReady ? `${status.provider || "Model"}${status.model ? ` · ${status.model}` : ""}. Decisions appear as they arrive.` : "Connect a model to run a live trial. Rehearsal is available now.";
      $("liveButton").title = modelReady ? "Start a real model-driven trial" : "Open Connections to configure a model";
    } catch (_) {
      state.status = { model_configured: false, offline: true };
      $("connectionState").innerHTML = "<i></i>Visual rehearsal available";
      setToolStatus("modelStatus", "Server offline", false);
      setToolStatus("bruinStatus", "Not connected", false);
      setToolStatus("bandStatus", "Not connected", false);
      setToolStatus("telemStatus", "Not connected", false);
      $("startHelp").textContent = "The visual rehearsal works offline. Open Connections for a live trial.";
    }
  }

  function setDrawer(open) {
    $("experience").classList.toggle("record-hidden", !open);
    $("recordToggle").setAttribute("aria-expanded", String(open));
  }
  setDrawer(window.innerWidth >= 1200);
  $("recordToggle").addEventListener("click", () => setDrawer($("experience").classList.contains("record-hidden")));
  $("recordClose").addEventListener("click", () => setDrawer(false));

  document.querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      $("panel-" + item.dataset.tab).hidden = !selected;
    });
  }));

  function selectVariant(variant) {
    state.variant = variant;
    document.querySelectorAll("[data-variant]").forEach((button) => {
      const selected = button.dataset.variant === variant;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    $("variantDescription").textContent = variant === "authorization" ? "A signed license enters the record. Does it actually authorize this use?" : "The platform's probe traffic is in evidence. Consent is disputed.";
  }
  document.querySelectorAll("[data-variant]").forEach((button) => button.addEventListener("click", () => selectVariant(button.dataset.variant)));

  function updateVoices() {
    if (!("speechSynthesis" in window)) {
      $("voiceToggle").disabled = true;
      $("voiceReport").textContent = "This browser does not provide system speech. All dialogue remains available as subtitles.";
      return;
    }
    const available = window.speechSynthesis.getVoices();
    const english = available.filter((voice) => /^en(?:-|_)/i.test(voice.lang));
    const candidates = english.length ? english : available;
    const unique = Array.from(new Map(candidates.map((voice) => [voice.voiceURI || voice.name, voice])).values());
    const preferred = ["Samantha", "Daniel", "Karen", "Alex", "Google US English", "Microsoft Aria", "Microsoft Guy"];
    unique.sort((a, b) => {
      const ai = preferred.findIndex((name) => a.name.includes(name)), bi = preferred.findIndex((name) => b.name.includes(name));
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    state.voices = unique;
    ["prosecutor", "defense", "witness", "judge"].forEach((id, index) => { state.voiceMap[id] = unique.length ? unique[index % unique.length] : null; });
    if (unique.length >= 4) $("voiceReport").textContent = "Four distinct system voices are available. Enable Voices for spoken dialogue.";
    else if (unique.length) $("voiceReport").textContent = `${unique.length} distinct system voice${unique.length === 1 ? " is" : "s are"} available. Roles share voices with different pitch and pacing; four unique voices are not available here.`;
    else $("voiceReport").textContent = "System voices are loading. If none become available, the trial will use subtitles only.";
  }
  updateVoices();
  if ("speechSynthesis" in window) window.speechSynthesis.addEventListener("voiceschanged", updateVoices);

  function cancelSpeech() {
    state.speechToken += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function stopCaptionClock(preserveElapsed = false) {
    if (preserveElapsed && state.captionStartedAt) state.captionElapsed = Math.max(0, performance.now() - state.captionStartedAt);
    clearTimeout(state.captionTimer);
    state.captionTimer = null;
    state.captionStartedAt = 0;
    state.captionToken += 1;
  }

  function showCaptionChunk(index) {
    const chunk = state.captionChunks[index];
    if (!chunk) return;
    state.captionIndex = index;
    $("dialogueText").textContent = chunk.text;
    $("captionCounter").textContent = state.captionChunks.length > 1 ? `${index + 1} / ${state.captionChunks.length}` : "";
  }

  function showCaptionAt(charIndex) {
    let index = 0;
    for (let i = 0; i < state.captionChunks.length; i += 1) {
      if (state.captionChunks[i].start <= charIndex) index = i;
      else break;
    }
    if (index !== state.captionIndex) showCaptionChunk(index);
  }

  function prepareCaptions(text) {
    stopCaptionClock();
    const original = String(text || "No dialogue provided.");
    const words = Array.from(original.matchAll(/\S+/g));
    const fontSize = Number.parseFloat(getComputedStyle($("dialogueText")).fontSize) || 19;
    const width = $("dialogue").clientWidth || $("cinema").clientWidth - 48;
    const charactersPerLine = Math.floor(Math.max(200, width - 38) / (fontSize * .51));
    const maxChars = Math.max(70, Math.min(158, charactersPerLine * 2 - 12));
    const maxWords = width < 450 ? 17 : 23;
    state.captionChunks = [];
    for (let start = 0; start < words.length;) {
      let end = Math.min(start + maxWords, words.length);
      while (end > start + 1 && words[end - 1].index + words[end - 1][0].length - words[start].index > maxChars) end -= 1;
      for (let i = start + 8; i < end; i += 1) {
        if (/[.!?]["'”’)]*$/.test(words[i][0])) { end = i + 1; break; }
      }
      const firstChar = words[start].index;
      const lastChar = words[end - 1].index + words[end - 1][0].length;
      state.captionChunks.push({ text: original.slice(firstChar, lastChar), start: firstChar, end: lastChar });
      start = end;
    }
    state.captionTextLength = original.length;
    state.captionElapsed = 0;
    state.captionHasBoundary = false;
    state.captionIndex = -1;
    showCaptionChunk(0);
  }

  function startCaptionClock(duration, elapsed = 0) {
    stopCaptionClock();
    state.captionDuration = Math.max(1, duration);
    state.captionElapsed = elapsed;
    state.captionStartedAt = performance.now() - elapsed;
    const token = state.captionToken;
    const tick = () => {
      if (token !== state.captionToken || !state.playing) return;
      state.captionElapsed = Math.max(0, performance.now() - state.captionStartedAt);
      if (!state.captionHasBoundary) {
        const ratio = Math.min(1, state.captionElapsed / state.captionDuration);
        showCaptionAt(Math.floor(ratio * state.captionTextLength));
      }
      state.captionTimer = setTimeout(tick, 120);
    };
    tick();
  }

  function speechCaptionDuration(step) {
    const actor = CAST[step.agent] || CAST.judge;
    const words = String(step.text || "").split(/\s+/).length;
    const rate = Math.min(1.8, actor.rate * Number($("speed").value));
    return Math.max(4500, words * 390 / rate);
  }

  function speak(step) {
    cancelSpeech();
    if (filmMode) return false;
    if (!state.voiceEnabled || !state.voiceMap[step.agent] || !("speechSynthesis" in window)) return false;
    prepareCaptions(step.text);
    const token = state.speechToken;
    const utterance = new SpeechSynthesisUtterance(step.text);
    const actor = CAST[step.agent] || CAST.judge;
    utterance.voice = state.voiceMap[step.agent];
    utterance.lang = utterance.voice.lang;
    utterance.pitch = actor.pitch;
    utterance.rate = Math.min(1.8, actor.rate * Number($("speed").value));
    utterance.onstart = () => {
      if (token === state.speechToken && state.playing) startCaptionClock(speechCaptionDuration(step));
    };
    utterance.onboundary = (event) => {
      if (token !== state.speechToken || !state.playing) return;
      if (event.name === "word" || event.charIndex > 0) state.captionHasBoundary = true;
      showCaptionAt(event.charIndex);
    };
    utterance.onend = () => {
      if (token !== state.speechToken || !state.playing) return;
      stopCaptionClock();
      showCaptionChunk(state.captionChunks.length - 1);
      clearTimeout(state.timer);
      state.timer = setTimeout(advance, 900 / Number($("speed").value));
    };
    utterance.onerror = (event) => {
      if (token !== state.speechToken || event.error === "canceled" || event.error === "interrupted") return;
      $("voiceReport").textContent = `Voice playback is unavailable (${event.error || "system voice error"}). Subtitles continue normally.`;
    };
    window.speechSynthesis.speak(utterance);
    return true;
  }

  $("voiceToggle").addEventListener("click", () => {
    updateVoices();
    if (!state.voices.length) { toast("No system voice is currently available. You can keep watching with subtitles."); return; }
    state.voiceEnabled = !state.voiceEnabled;
    $("voiceToggle").setAttribute("aria-pressed", String(state.voiceEnabled));
    $("voiceToggle").querySelector("span").textContent = state.voiceEnabled ? "Voices on" : "Voices off";
    if (!state.voiceEnabled) {
      cancelSpeech();
      state.captionHasBoundary = false;
      if (state.playing && state.trial?.steps[state.index]) scheduleAdvance(state.trial.steps[state.index], true);
    }
    else if (state.playing && state.trial?.steps[state.index]) { speak(state.trial.steps[state.index]); scheduleAdvance(state.trial.steps[state.index]); }
  });

  function updateMode() {
    const scripted = state.originMode === "preview";
    $("modeBadge").textContent = state.mode === "replay" ? (scripted ? "RECORDED REHEARSAL" : state.originMode === "live" ? "RECORDED REAL RUN" : "RECORDED RUN") : scripted ? "VISUAL REHEARSAL" : "LIVE MODEL SESSION";
    $("modeBadge").classList.toggle("live", !scripted && state.mode !== "replay");
    $("modeBadge").classList.toggle("preview", scripted);
    $("rehearsalLabel").hidden = !scripted;
  }

  function setBusy(busy) {
    $("liveButton").disabled = busy;
    $("previewButton").disabled = busy;
    document.querySelectorAll("[data-variant]").forEach((button) => { button.disabled = busy; });
  }

  function updatePlaybackUI() {
    $("playPause").disabled = !state.trial || state.finished;
    $("playPause").setAttribute("aria-label", state.playing ? "Pause playback" : "Resume playback");
    $("pauseIcon").hidden = !state.playing;
    $("playIcon").hidden = state.playing;
    const total = state.trial?.steps?.length || 0;
    const complete = state.trial?.status === "complete";
    const percent = state.finished ? 100 : total ? Math.round((state.index + 1) / (complete ? total : total + 1) * 100) : 0;
    $("progressFill").style.width = `${Math.min(100, percent)}%`;
    $("progressTrack").setAttribute("aria-valuenow", String(Math.min(100, percent)));
    document.querySelectorAll(".performer").forEach((actor) => actor.classList.toggle("speaking", state.playing && !state.waitingForStep && actor.classList.contains("active")));
    $("replayButton").disabled = !state.trial || state.trial.status === "running" || state.startPending;
  }

  function resetPlayback(mode) {
    clearTimeout(state.timer);
    stopCaptionClock();
    clearTimeout(state.pollTimer);
    cancelSpeech();
    state.index = -1;
    state.mode = mode;
    state.finished = false;
    state.waitingForStep = false;
    state.playing = true;
    state.evidenceKey = "";
    $("verdictOverlay").hidden = true;
    $("dialogue").hidden = true;
    $("openingCopy").hidden = true;
    $("projection").hidden = true;
    $("decisionList").replaceChildren();
    $("recordCount").textContent = "0";
    $("emptyRecord").hidden = false;
    $("cinema").dataset.camera = "wide";
    document.querySelectorAll(".performer").forEach((actor) => actor.classList.remove("active", "speaking"));
    updateMode();
    updatePlaybackUI();
  }

  function errorMessage(error) { return error?.name === "AbortError" ? "The server did not respond in time." : error?.message || "The trial could not be loaded."; }

  async function startTrial(mode) {
    if (state.startPending) return;
    if (mode === "live" && !state.status?.model_configured) { window.location.href = "/setup.html"; return; }
    state.startPending = true;
    state.pollGeneration += 1;
    state.originMode = mode;
    state.trial = null;
    resetPlayback(mode);
    setBusy(true);
    $("playbackTitle").textContent = mode === "preview" ? "Preparing the visual rehearsal…" : "Opening the live trial…";
    $("playbackSubtitle").textContent = mode === "preview" ? "A scripted scene to preview the staging and voices." : "Waiting for the server to create the session.";
    try {
      if (mode === "preview" && state.status?.offline) throw new Error("offline rehearsal");
      const created = await request("/api/trials", { method: "POST", body: JSON.stringify({ variant: state.variant, mode }) });
      if (!created.id) throw new Error("The server did not return a trial ID.");
      state.trial = { id: created.id, status: "running", steps: [], evidence: [], variant: state.variant };
      state.startPending = false;
      await pollTrial(state.pollGeneration);
    } catch (error) {
      if (mode === "preview") {
        state.trial = makePreview(state.variant);
        state.startPending = false;
        renderTrialDetails();
        advance();
      } else {
        state.startPending = false;
        state.playing = false;
        $("playbackTitle").textContent = "The trial could not start.";
        $("playbackSubtitle").textContent = errorMessage(error);
        setBusy(false);
        updatePlaybackUI();
        toast(errorMessage(error));
      }
    }
  }

  async function pollTrial(generation) {
    if (!state.trial?.id || generation !== state.pollGeneration) return;
    try {
      const snapshot = await request(`/api/trials/${encodeURIComponent(state.trial.id)}`, {}, 8000);
      if (generation !== state.pollGeneration) return;
      state.trial = { ...state.trial, ...snapshot, steps: Array.isArray(snapshot.steps) ? snapshot.steps : state.trial.steps, evidence: Array.isArray(snapshot.evidence) ? snapshot.evidence : state.trial.evidence };
      renderTrialDetails();
      if (state.trial.status === "failed") {
        state.playing = false;
        clearTimeout(state.timer);
        cancelSpeech();
        $("playbackTitle").textContent = "The session stopped.";
        $("playbackSubtitle").textContent = typeof state.trial.error === "string" ? state.trial.error : state.trial.error?.message || "The server reported a failed trial.";
        setBusy(false);
        updatePlaybackUI();
        return;
      }
      if (state.playing && state.index < 0 && state.trial.steps.length) advance();
      else if (state.playing && state.index >= state.trial.steps.length - 1 && !state.timer) advance();
      else if (!state.trial.steps.length) {
        $("playbackTitle").textContent = "Waiting for the first statement…";
        $("playbackSubtitle").textContent = `Session ${state.trial.id.slice(0, 8)} · ${state.trial.status || "running"}. No dialogue received yet.`;
      }
      if (state.trial.status === "running") state.pollTimer = setTimeout(() => pollTrial(generation), 1000);
    } catch (error) {
      if (generation !== state.pollGeneration) return;
      $("playbackSubtitle").textContent = `Connection interrupted. ${errorMessage(error)} Retrying…`;
      state.pollTimer = setTimeout(() => pollTrial(generation), 2000);
    }
  }

  function renderTrialDetails() {
    if (!state.trial) return;
    $("recordFootText").textContent = `${state.originMode === "preview" ? "Scripted rehearsal" : "Session"} · ${state.trial.id.slice(0, 8)}`;
    $("downloadButton").disabled = !state.trial.steps.length;
    $("evidenceCount").textContent = state.trial.evidence.length;
    const evidenceKey = JSON.stringify(state.trial.evidence);
    if (evidenceKey !== state.evidenceKey) { renderEvidence(); state.evidenceKey = evidenceKey; }
    const pipeline = state.trial.pipeline;
    $("pipelineState").textContent = pipeline?.status ? humanize(pipeline.status) : state.originMode === "preview" ? "Visual rehearsal — no checked snapshot." : "Waiting for a pipeline result.";
    $("checkList").replaceChildren();
    (pipeline?.checks || []).forEach((check) => {
      const item = document.createElement("li");
      const result = typeof check === "string" ? { name: check, status: "reported" } : check;
      const passed = result.passed === true || result.pass === true || ["passed", "pass", "success", "ok"].includes(String(result.status).toLowerCase());
      const failed = result.passed === false || result.pass === false || ["failed", "fail", "error", "blocked"].includes(String(result.status).toLowerCase());
      const mark = document.createElement("span");
      mark.className = "check-mark" + (failed ? " failed" : "");
      mark.textContent = passed ? "✓" : failed ? "×" : "—";
      const text = document.createElement("span");
      text.textContent = [result.name || result.check || "Data check", result.message || result.status].filter(Boolean).join(" · ");
      item.append(mark, text); $("checkList").append(item);
    });
    $("snapshotId").textContent = pipeline?.snapshot_id ? `SNAPSHOT ${pipeline.snapshot_id}` : "";
    updatePlaybackUI();
  }

  function safeURL(value) { try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null; } catch (_) { return null; } }
  function humanize(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()); }

  function renderEvidence() {
    $("evidenceList").replaceChildren();
    state.trial.evidence.forEach((evidence, index) => {
      const article = document.createElement("article"); article.className = "evidence-item";
      const button = document.createElement("button");
      const number = document.createElement("span"); number.className = "exhibit-index"; number.textContent = `EXHIBIT ${String(index + 1).padStart(2, "0")} · ${evidence.id}`;
      const title = document.createElement("h4"); title.textContent = evidence.title || evidence.id;
      const quote = document.createElement("p"); quote.textContent = evidence.quote || "No extract provided.";
      button.append(number, title, quote); button.addEventListener("click", () => showEvidence(evidence.id)); article.append(button);
      const link = safeURL(evidence.source_url);
      if (link) { const anchor = document.createElement("a"); anchor.href = link; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.textContent = `View source · ${new URL(link).hostname}`; article.append(anchor); }
      const tag = document.createElement("span"); tag.className = "evidence-tag"; tag.textContent = `${evidence.source_type === "web_source" ? "Web source" : "Fictional case exhibit"} · ${evidence.status || "Provided"}`; article.append(tag);
      $("evidenceList").append(article);
    });
  }

  function showEvidence(id) {
    const index = state.trial?.evidence.findIndex((item) => item.id === id) ?? -1;
    if (index < 0) { $("projection").hidden = true; return; }
    const evidence = state.trial.evidence[index];
    $("exhibitNumber").textContent = String(index + 1).padStart(2, "0");
    $("exhibitType").textContent = evidence.source_type === "web_source" ? "WEB SOURCE" : "CASE EXHIBIT";
    $("exhibitTitle").textContent = evidence.title || evidence.id;
    $("exhibitQuote").textContent = evidence.quote || "No extract provided.";
    $("exhibitStatus").textContent = evidence.status || "Provided in case material";
    $("exhibitSymbol").textContent = /licen|author|consent/i.test(`${evidence.title} ${evidence.id}`) ? "§" : /log|call|traffic/i.test(`${evidence.title} ${evidence.id}`) ? "⌁" : /audit|similar/i.test(`${evidence.title} ${evidence.id}`) ? "≋" : "◇";
    $("projection").hidden = true;
    void $("projection").offsetWidth;
    $("projection").hidden = false;
  }

  function renderDecisionLog() {
    $("decisionList").replaceChildren();
    const shown = state.trial.steps.slice(0, state.index + 1);
    $("emptyRecord").hidden = shown.length > 0;
    $("recordCount").textContent = shown.length;
    shown.forEach((step, index) => {
      const actor = CAST[step.agent] || CAST.judge;
      const item = document.createElement("li"); item.className = "decision-entry" + (index === state.index ? " playing" : ""); item.style.setProperty("--entry-color", actor.color);
      const top = document.createElement("div"); top.className = "entry-top";
      const role = document.createElement("span"); role.textContent = actor.role;
      const count = document.createElement("span"); count.textContent = String(step.n || index + 1).padStart(2, "0"); top.append(role, count);
      const title = document.createElement("h4"); title.textContent = step.decision || humanize(step.kind);
      const why = document.createElement("p"); why.textContent = step.why || "No stated rationale provided.";
      item.append(top, title, why);
      const transcript = document.createElement("details"); transcript.className = "statement-transcript";
      const summary = document.createElement("summary"); summary.textContent = "Full statement";
      const fullText = document.createElement("p"); fullText.textContent = step.text || "No dialogue provided.";
      transcript.append(summary, fullText); item.append(transcript);
      if (step.evidence_ids?.length) { const tags = document.createElement("div"); tags.className = "entry-evidence"; step.evidence_ids.forEach((id) => { const tag = document.createElement("span"); tag.textContent = id; tags.append(tag); }); item.append(tags); }
      if (step.band_task_id) { const task = document.createElement("div"); task.className = "entry-task"; task.textContent = `BAND ${step.band_task_id}`; item.append(task); }
      $("decisionList").append(item);
    });
    $("panel-decisions").scrollTop = $("panel-decisions").scrollHeight;
  }

  function displayStep(step) {
    state.waitingForStep = false;
    const actor = CAST[step.agent] || CAST.judge;
    $("cinema").dataset.camera = CAST[step.agent] ? step.agent : "judge";
    $("cinema").style.setProperty("--actor-color", actor.color);
    const content = `${step.kind || ""} ${step.decision || ""}`;
    const isVerdict = step.kind === "rule" || /verdict|ruling|裁定/i.test(content);
    const isObjection = /object|rebut|challenge|challenge|异议/i.test(content);
    const pose = isVerdict ? "ruling" : isObjection ? "objection" : step.evidence_ids?.length ? "evidence" : "speaking";
    $("cinema").dataset.pose = pose;
    document.querySelectorAll(".performer").forEach((element) => { element.classList.toggle("active", element.dataset.agent === step.agent); });
    $("speakerRole").textContent = actor.role;
    $("speakerName").textContent = actor.name;
    $("statementKind").textContent = humanize(step.kind || "Statement");
    $("dialogue").hidden = false;
    prepareCaptions(step.text);
    $("openingCopy").hidden = true;
    $("statementCounter").textContent = `STATEMENT ${String(state.index + 1).padStart(2, "0")}${state.trial.status === "complete" ? ` / ${String(state.trial.steps.length).padStart(2, "0")}` : ""}${step.round ? ` · ROUND ${step.round}` : ""}`;
    showEvidence(step.evidence_ids?.[0]);
    $("playbackTitle").textContent = `${actor.name} · ${humanize(step.kind || "Statement")}`;
    $("playbackSubtitle").textContent = state.originMode === "preview" ? "Scripted visual rehearsal. These statements are written in advance." : state.mode === "replay" ? state.originMode === "live" ? "Recorded real model run. No new model calls are being made." : "Playing a saved run. Its original mode was not reported." : `${state.trial.status === "running" ? "Receiving live decisions" : "All decisions received"} · session ${state.trial.id.slice(0, 8)}`;
    if (isObjection || isVerdict) {
      $("dramaticCue").textContent = isVerdict ? "THE COURT FINDS…" : "OBJECTION!";
      $("dramaticCue").classList.remove("show"); $("cinema").classList.remove("impact"); void $("dramaticCue").offsetWidth;
      $("dramaticCue").classList.add("show"); $("cinema").classList.add("impact");
    }
    renderDecisionLog();
    speak(step);
    updatePlaybackUI();
    if (filmMode) $("filmNote").textContent = `Statement ${state.index + 1} of ${state.trial.steps.length} · ${step.agent} · ${step.duration_ms ? `${step.duration_ms} ms` : "Default reading duration"} · silent capture`;
  }

  function scheduleAdvance(step, preserveCaptions = false) {
    clearTimeout(state.timer);
    const words = String(step.text || "").split(/\s+/).length;
    const suppliedDuration = Number(step.duration_ms);
    const duration = filmMode && Number.isFinite(suppliedDuration) && suppliedDuration > 0 ? suppliedDuration : Math.max(5800, Math.min(state.voiceEnabled ? 30000 : 15500, words * (state.voiceEnabled ? 500 : 340))) / Number($("speed").value);
    const spokenDuration = Number(step.audio_duration_ms);
    const captionDuration = filmMode && Number.isFinite(spokenDuration) && spokenDuration > 0 ? spokenDuration : state.voiceEnabled ? speechCaptionDuration(step) : duration;
    startCaptionClock(preserveCaptions ? state.captionDuration || captionDuration : captionDuration, preserveCaptions ? state.captionElapsed : 0);
    state.timer = setTimeout(captureMode ? () => {
      state.timer = null;
      stopCaptionClock();
      showCaptionChunk(state.captionChunks.length - 1);
      state.playing = false;
      updatePlaybackUI();
      $("filmNote").textContent = `Capture statement ${state.index + 1} complete. Holding the last caption until the next capture command.`;
    } : advance, duration);
  }

  function advance() {
    clearTimeout(state.timer); state.timer = null;
    stopCaptionClock();
    if (!state.playing || !state.trial) return;
    if (state.index + 1 < state.trial.steps.length) {
      state.index += 1;
      const step = state.trial.steps[state.index];
      displayStep(step); scheduleAdvance(step);
    } else if (state.trial.status === "complete") finish();
    else if (state.trial.status === "running") {
      state.waitingForStep = true;
      $("playbackTitle").textContent = "Waiting for the next statement…";
      $("playbackSubtitle").textContent = `${state.trial.steps.length} statement${state.trial.steps.length === 1 ? "" : "s"} received. The live session is still running.`;
      cancelSpeech();
      document.querySelectorAll(".performer").forEach((actor) => actor.classList.remove("speaking"));
    }
  }

  function finish() {
    if (state.finished) return;
    state.finished = true; state.playing = false;
    clearTimeout(state.timer); state.timer = null; cancelSpeech(); stopCaptionClock();
    const verdict = state.trial.verdict;
    if (verdict?.outcome) {
      $("verdictOutcome").textContent = humanize(verdict.outcome);
      $("verdictReason").textContent = verdict.reason || "No verdict explanation was provided.";
      $("verdictEvidence").textContent = verdict.evidence_ids?.length ? `EVIDENCE RELIED ON · ${verdict.evidence_ids.join(" / ")}` : "";
      $("verdictOverlay").hidden = false;
    }
    $("playbackTitle").textContent = "The court has adjourned.";
    $("playbackSubtitle").textContent = state.originMode === "preview" ? "Rehearsal complete. Connect a model for a live case." : "Replay this run, inspect the record, or change the evidence and begin again.";
    setBusy(false); updatePlaybackUI();
    if (state.originMode === "live" && !filmMode) loadStatus();
    if (filmMode) $("filmNote").textContent = "Recorded film complete. Start film restarts the recording; Previous statement returns to the dialogue.";
  }

  $("playPause").addEventListener("click", () => {
    if (!state.trial || state.finished) return;
    state.playing = !state.playing;
    if (!state.playing) {
      clearTimeout(state.timer); state.timer = null;
      stopCaptionClock(true);
      if ("speechSynthesis" in window) window.speechSynthesis.pause();
      $("playbackTitle").textContent = "Playback paused.";
      $("playbackSubtitle").textContent = state.trial.status === "running" ? "The live trial continues on the server. New statements are being collected." : "Resume when you are ready.";
    } else {
      if ("speechSynthesis" in window) window.speechSynthesis.resume();
      const step = state.trial.steps[state.index];
      if (step) { $("playbackTitle").textContent = `${CAST[step.agent]?.name || "Court"} · ${humanize(step.kind)}`; scheduleAdvance(step, true); }
      else advance();
    }
    updatePlaybackUI();
  });
  $("speed").addEventListener("change", () => { if (state.playing && state.trial?.steps[state.index]) { speak(state.trial.steps[state.index]); scheduleAdvance(state.trial.steps[state.index]); } });
  $("liveButton").addEventListener("click", () => startTrial("live"));
  $("previewButton").addEventListener("click", () => startTrial("preview"));
  $("replayButton").addEventListener("click", () => {
    if (!state.trial || state.trial.status === "running") return;
    state.pollGeneration += 1; resetPlayback("replay"); setBusy(true); advance();
  });
  $("verdictClose").addEventListener("click", () => { $("verdictOverlay").hidden = true; });
  async function loadRecordedRun(run, { autoplay = true } = {}) {
    const mode = run.mode || run.source_mode || (run.provider ? "live" : "recorded");
    state.pollGeneration += 1;
    state.originMode = mode;
    state.trial = { id: run.id, status: "running", steps: [], evidence: [], variant: run.variant || "baseline" };
    selectVariant(state.trial.variant);
    resetPlayback("replay");
    state.playing = autoplay;
    setBusy(true);
    $("playbackTitle").textContent = "Loading the recorded trial…";
    $("playbackSubtitle").textContent = "No new model call is being made.";
    if (run.file && /^[a-zA-Z0-9_-]+\.json$/.test(run.file)) {
      try {
        const snapshot = await request(`/recordings/${encodeURIComponent(run.file)}`);
        state.trial = { ...state.trial, ...snapshot, steps: snapshot.steps || [], evidence: snapshot.evidence || [], status: snapshot.status || "complete" };
        renderTrialDetails();
        if (autoplay) advance();
        else {
          $("openingCopy").hidden = false;
          $("playbackTitle").textContent = "The recorded trial is ready.";
          $("playbackSubtitle").textContent = "Press Start film to begin playback.";
          updatePlaybackUI();
        }
      } catch (error) {
        state.playing = false;
        setBusy(false); updatePlaybackUI();
        $("playbackTitle").textContent = "The recording could not be loaded.";
        $("playbackSubtitle").textContent = errorMessage(error);
        throw error;
      }
    } else await pollTrial(state.pollGeneration);
    return state.trial;
  }

  $("recordedButton").addEventListener("click", async () => {
    $("runsDialog").showModal();
    $("runsList").textContent = "Loading recorded trials…";
    try {
      let response;
      try { response = await request("/api/runs"); }
      catch (_) { response = await request("/recordings/index.json"); }
      const allRuns = Array.isArray(response) ? response : response.runs || [];
      const runs = allRuns.filter((run) => run.status === "complete" || !run.status);
      $("runsList").replaceChildren();
      if (!runs.length) { $("runsList").textContent = "No completed trials are in the archive yet."; return; }
      runs.forEach((run) => {
        const button = document.createElement("button"); button.className = "saved-run";
        const mode = run.mode || run.source_mode || (run.provider ? "live" : "recorded");
        const meta = document.createElement("span"); meta.className = "saved-run-meta";
        meta.textContent = `${mode === "live" ? "RECORDED REAL RUN" : mode === "preview" ? "SCRIPTED REHEARSAL" : "RECORDED RUN"} · ${String(run.id).slice(0, 8)}`;
        const title = document.createElement("strong"); title.textContent = run.case_title || (run.variant === "authorization" ? "A signed license" : "The original filing");
        const detail = document.createElement("span");
        const outcome = run.outcome || (typeof run.verdict === "string" ? run.verdict : run.verdict?.outcome);
        const createdAt = run.completed_at || run.created_at || run.started_at;
        detail.textContent = [humanize(run.variant || "baseline"), outcome ? humanize(outcome) : null, createdAt ? new Date(createdAt).toLocaleString() : null].filter(Boolean).join(" · ");
        button.append(meta, title, detail);
        button.addEventListener("click", async () => {
          $("runsDialog").close();
          try { await loadRecordedRun(run); } catch (error) { toast(errorMessage(error)); }
        });
        $("runsList").append(button);
      });
    } catch (error) { $("runsList").textContent = errorMessage(error); }
  });
  $("runsClose").addEventListener("click", () => $("runsDialog").close());
  $("runsDialog").addEventListener("click", (event) => { if (event.target === $("runsDialog")) { const rect = $("runsDialog").getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $("runsDialog").close(); } });
  $("downloadButton").addEventListener("click", () => {
    if (!state.trial) return;
    const data = { ...state.trial, presentation_mode: state.mode, origin_mode: state.originMode };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `courtroom-${state.trial.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("integrityButton").addEventListener("click", async () => {
    const button = $("integrityButton");
    button.disabled = true;
    button.textContent = "Checking the injected citation…";
    $("integrityResults").replaceChildren();
    try {
      const result = await request("/api/integrity-demo", { method: "POST", body: "{}" }, 60000);
      for (const [key, label] of [["failed", "Unknown exhibit ID"], ["repaired", "Corrected reference"]]) {
        const report = result[key];
        if (!report) continue;
        const section = document.createElement("div");
        section.className = "integrity-result";
        const heading = document.createElement("strong");
        const status = String(report.status || "Not reported");
        heading.textContent = `${label} · ${status.toUpperCase()}`;
        heading.className = status === "passed" ? "integrity-passed" : status === "blocked" ? "integrity-blocked" : "";
        section.append(heading);
        if (report.snapshot_id) {
          const snapshot = document.createElement("span"); snapshot.textContent = `Snapshot ${report.snapshot_id}`; section.append(snapshot);
        }
        const issues = report.issues || [];
        if (issues.length) {
          const message = document.createElement("p");
          message.textContent = issues.map((issue) => typeof issue === "string" ? issue : issue.message || issue.description || issue.code || JSON.stringify(issue)).join(" · ");
          section.append(message);
        }
        const checks = report.checks || [];
        if (checks.length) {
          const summary = document.createElement("p");
          summary.textContent = checks.map((check) => typeof check === "string" ? check : `${check.name || check.check || "Check"}: ${check.status || (check.passed === true ? "passed" : check.passed === false ? "failed" : "reported")}`).join(" · ");
          section.append(summary);
        }
        $("integrityResults").append(section);
      }
      if (result.explanation) { const note = document.createElement("p"); note.textContent = result.explanation; $("integrityResults").append(note); }
      if (!result.failed && !result.repaired) $("integrityResults").textContent = "The server did not return the expected two validation reports.";
    } catch (error) {
      $("integrityResults").textContent = errorMessage(error);
    } finally { button.disabled = false; button.textContent = "Test a broken citation"; }
  });

  function makePreview(variant) {
    const licensed = variant === "authorization";
    const evidence = [
      { id: "exhibit-access", title: "2.1 million calls. Eleven days.", source_type: "case_exhibit", source_url: null, quote: "A fictional platform access log records a concentrated sequence of expert-skill probe calls.", status: "Fictional exhibit — supplied for rehearsal" },
      { id: "exhibit-audit", title: "The signature in the answers", source_type: "case_exhibit", source_url: null, quote: "A fictional audit reports an 87% match to the expert's signature heuristics. Similarity alone does not establish ownership.", status: "Fictional exhibit — disputed interpretation" },
      { id: "exhibit-revenue", title: "A market disappears", source_type: "case_exhibit", source_url: null, quote: "Maya's fictional sales ledger reports a $48,000 decline after the platform update.", status: "Fictional exhibit — causation disputed" },
    ];
    if (licensed) evidence.push({ id: "exhibit-license", title: "The signed authorization", source_type: "case_exhibit", source_url: null, quote: "A fictional signed license explicitly permits using paid output calls for model training and capability distillation.", status: "Fictional exhibit — alternative case variant" });
    const steps = [
      ["judge", "opening", "This court will hear one question: when a platform learns an expert's craft, what did it actually have permission to take? Counsel, enter your evidence.", "Open the hearing", "The parties must connect their claims to exhibits in this fictional record.", []],
      ["prosecutor", "evidence", "Two point one million calls in eleven days. These were not ordinary customers asking for help. They were systematic probes of Maya's expertise.", "Present the platform access log", "The pattern and concentration of calls support the claim of deliberate extraction.", ["exhibit-access"]],
      ["defense", "objection", "Objection. Volume proves volume. It does not prove that anything protected was copied. Show this court what was taken — and the rule that forbids it.", "Challenge the inference from traffic", "Evidence of intensive access is not, by itself, evidence of unauthorized copying.", ["exhibit-access"]],
      ["witness", "testimony", "Four years of failures taught me what to look for. I put that judgment into my Skill. After the update, a customer asked: why pay you when the platform does it now?", "Describe the work behind the Skill", "The expert explains the origin of the heuristics and the reported economic impact.", ["exhibit-revenue"]],
      ["prosecutor", "evidence", "The audit found her signature in eighty-seven percent of the answers. The platform did not just improve a service. It reproduced the reason people paid her.", "Introduce the similarity audit", "The audit is offered as corroboration, with its interpretation still open to challenge.", ["exhibit-audit"]],
      ["defense", "rebuttal", licensed ? "Then let us examine the document the prosecution omitted. Maya signed an explicit authorization for training and distillation. The permission question has an answer." : "An audit can show a resemblance. It cannot turn an idea into property. No copied source code has been entered here. The court must keep that distinction intact.", licensed ? "Enter the signed license" : "Distinguish resemblance from copying", licensed ? "The alternative case includes an express authorization that materially changes the consent claim." : "The defense contests what the similarity evidence can establish.", [licensed ? "exhibit-license" : "exhibit-audit"]],
      ["judge", "question", licensed ? "Maya, is this your signature? And did the license expressly include distillation, rather than merely improving a service?" : "Maya, did you authorize this kind of use? Not access to individual answers — the systematic transfer of your expertise into a competing model.", "Test the scope of consent", "The court separates permission to access a service from permission for the disputed downstream use.", licensed ? ["exhibit-license"] : ["exhibit-access"]],
      ["witness", "testimony", licensed ? "That is my signature. The word distillation is there. I regret what it did to my business, but I cannot honestly tell this court I never agreed." : "I authorized paid reviews for customers. I did not give the platform permission to build a replacement from millions of probes. No one asked for that.", licensed ? "Acknowledge the authorization" : "Dispute authorization for distillation", licensed ? "The witness concedes a fact that weakens the original no-consent allegation." : "The witness disputes consent to the specific conduct at issue.", licensed ? ["exhibit-license"] : []],
      ["prosecutor", "closing", licensed ? "The loss is real. But in this record I cannot maintain that the use occurred without express consent. I withdraw that part of the allegation." : "The log, the audit and the lost business tell one story. Access for a paid service became the raw material for replacing its creator. That use required permission.", licensed ? "Concede the consent point" : "Connect the exhibits", licensed ? "The signed document changes what the prosecution can honestly claim." : "The prosecution asks the court to assess the evidence together, while accepting its limits.", licensed ? ["exhibit-license"] : ["exhibit-access", "exhibit-audit"]],
      ["judge", "verdict", licensed ? "On the fictional record before us, the claim of use without consent is not established. The signed authorization changes the result. A different legal claim would require its own evidence." : "On this fictional record, the court finds for Maya on the disputed authorization. The decision rests on this case's stated rules and evidence. It is not a statement of real-world law.", "Issue a reasoned decision", "The rehearsal conclusion follows the chosen fictional evidence variant; a live model trial may reach a different result.", licensed ? ["exhibit-license"] : ["exhibit-access", "exhibit-audit"]],
    ].map((row, index) => ({ n: index + 1, agent: row[0], kind: row[1], text: row[2], decision: row[3], why: row[4], evidence_ids: row[5], round: Math.max(1, Math.ceil(index / 3)), band_task_id: null }));
    return { id: `rehearsal-${variant}`, status: "complete", case_title: "The Community v. SkillVault, Inc.", variant, steps, evidence, pipeline: { status: "not_run", checks: [], snapshot_id: null }, verdict: { outcome: licensed ? "Claim not established" : "Finding for the expert", reason: licensed ? "Express authorization defeats the rehearsal's claim of use without consent. The material evidence changed, so the scripted result changed." : "The scripted court finds that this fictional record does not establish authorization for the disputed distillation. A live trial must reason from the actual supplied record.", evidence_ids: licensed ? ["exhibit-license"] : ["exhibit-access", "exhibit-audit"] } };
  }

  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;
    if (event.code === "Space" && state.trial && !state.finished) { event.preventDefault(); $("playPause").click(); }
    if (event.key === "Escape") { setDrawer(false); $("verdictOverlay").hidden = true; }
  });

  function filmJump(index) {
    if (!state.trial?.steps.length) return;
    clearTimeout(state.timer); state.timer = null;
    stopCaptionClock(); cancelSpeech();
    state.finished = false;
    state.playing = true;
    state.waitingForStep = false;
    state.index = Math.max(0, Math.min(state.trial.steps.length - 1, index));
    $("verdictOverlay").hidden = true;
    const step = state.trial.steps[state.index];
    displayStep(step);
    scheduleAdvance(step);
    window.scrollTo(0, 0);
  }

  async function initializeFilm() {
    document.body.classList.add("film-mode");
    if (captureMode) document.body.classList.add("capture-mode");
    $("filmControls").hidden = false;
    $("speed").value = "1";
    state.voiceEnabled = false;
    const marker = document.createElement("span"); marker.className = "film-case-label"; marker.textContent = "FICTIONAL CASE"; $("cinema").append(marker);
    const file = pageOptions.get("recording") || "baseline.json";
    try {
      if (!["baseline.json", "authorization.json", "connected.json"].includes(file)) throw new Error("Choose baseline.json, authorization.json, or connected.json.");
      const archive = await request("/recordings/index.json");
      const run = (archive.runs || []).find((item) => item.file === file);
      if (!run) throw new Error("This recording is not listed in the saved archive.");
      await loadRecordedRun(run, { autoplay: false });
      if (!state.trial.steps.length) throw new Error("This recording contains no statements.");
      for (const id of ["filmStart", "filmNext", "filmPrevious"]) $(id).disabled = false;
      if (captureMode) {
        const controls = document.createElement("div"); controls.className = "capture-statement-controls";
        state.trial.steps.forEach((_, index) => {
          const button = document.createElement("button"); button.textContent = `Capture statement ${index + 1}`;
          button.addEventListener("click", () => filmJump(index));
          controls.append(button);
        });
        $("filmControls").append(controls);
      }
      $("filmNote").textContent = `${state.trial.steps.length} saved statements ready. Start film plays their recorded duration; Next and Previous select statements without a model call.`;
      window.scrollTo(0, 0);
    } catch (error) {
      $("modeBadge").textContent = "RECORDING UNAVAILABLE";
      $("openingCopy").hidden = false;
      $("openingCopy").querySelector("span").textContent = errorMessage(error);
      $("filmNote").textContent = errorMessage(error);
    }
  }

  $("filmStart").addEventListener("click", () => {
    if (!filmMode || !state.trial?.steps.length) return;
    resetPlayback("replay"); setBusy(true); advance(); window.scrollTo(0, 0);
  });
  $("filmNext").addEventListener("click", () => filmJump(state.index + 1));
  $("filmPrevious").addEventListener("click", () => filmJump(state.index - 1));
  window.addEventListener("beforeunload", () => cancelSpeech());
  if (filmMode) initializeFilm();
  else loadStatus();
})();
