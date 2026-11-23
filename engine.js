/*
 * AI Courtroom — multi-agent deliberation engine
 * Track: Agent Animated Film (Multiplayer AI Hackathon, Thanksgiving Special)
 *
 * Four agents with their own goals argue a case. Nothing about the plot is
 * scripted end-to-end: at every turn an agent reads the shared state
 * (evidence on the table, the opponent's last claim, its own memory of
 * arguments already used and points already conceded) and picks its move.
 * The judge's verdict is computed from what actually happened in the room,
 * so the same setup produces different endings across runs.
 *
 * Pure JS, no dependencies. Runs in the browser and in Node for testing.
 */

"use strict";

// ---------- seeded RNG so a run can be replayed ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the case ----------
const CASE = {
  title: "The Community v. SkillVault, Inc.",
  charge:
    "SkillVault distilled a paid expert Skill into its base model without consent or payment.",
  expert: "Maya Chen, independent developer",
  skill: "CodeReview Pro, a paid code-review Skill",
  facts: {
    calls: "2.1 million calls",
    lostSales: "$48,000",
    similarity: "87% of probe answers matched the Skill's signature heuristics",
  },
};

// ---------- evidence deck (drawn in a seeded order) ----------
const EVIDENCE = [
  {
    id: "ev-logs",
    side: "pros",
    strength: 3,
    title: "Platform access logs",
    text: `SkillVault's own logs show its crawler called ${CASE.skill} ${CASE.facts.calls} in eleven days, always with distillation-style probe prompts.`,
  },
  {
    id: "ev-similarity",
    side: "pros",
    strength: 3,
    title: "Similarity audit",
    text: `An independent audit found ${CASE.facts.similarity}. Those heuristics exist nowhere in public code.`,
  },
  {
    id: "ev-sales",
    side: "pros",
    strength: 2,
    title: "Sales collapse",
    text: `Within a month of SkillVault's model update, Maya's Skill revenue fell by ${CASE.facts.lostSales}. Her customers told her the base model "just does it now".`,
  },
  {
    id: "ev-tos",
    side: "def",
    strength: 2,
    title: "Terms of service",
    text: "SkillVault's terms say API outputs may be used to improve its services. Every developer who lists a Skill accepts those terms.",
  },
  {
    id: "ev-prior-art",
    side: "def",
    strength: 2,
    title: "Prior art",
    text: "Three of the seven heuristics in the audit also appear in a 2023 open-source linter. Ideas in the open are free for anyone, human or model, to learn.",
  },
  {
    id: "ev-no-copy",
    side: "def",
    strength: 1,
    title: "No weights, no code",
    text: "Forensics found no copied code and no copied weights in SkillVault's model. Whatever the model does, it learned; it did not paste.",
  },
];

// ---------- agents ----------
function makeAgents() {
  return {
    prosecutor: {
      id: "prosecutor",
      name: "Ada Voss",
      role: "Prosecutor",
      color: "#e4572e",
      goal: "Prove SkillVault took Maya's work and profited from it.",
      usedArgs: [],
      memory: [],
    },
    defense: {
      id: "defense",
      name: "Victor Hale",
      role: "Defense",
      color: "#2e6fe4",
      goal: "Show that learning from outputs is not theft, and no protected thing was copied.",
      usedArgs: [],
      conceded: [],
      memory: [],
    },
    witness: {
      id: "witness",
      name: "Maya Chen",
      role: "Witness, the expert",
      color: "#17a06b",
      goal: "Make the court feel what it costs when your craft is absorbed for free.",
      usedArgs: [],
      memory: [],
    },
    judge: {
      id: "judge",
      name: "Judge Rao",
      role: "Presiding judge",
      color: "#8e44ad",
      goal: "Weigh only what was shown in this room and explain the verdict.",
      memory: [],
    },
  };
}

// ---------- argument playbooks ----------
// Each entry: id, power, tags it attacks, and a line built from live state.
const PROS_ARGS = [
  {
    id: "pa-scale",
    power: 3,
    text: () =>
      "A student reads a book once. SkillVault read Maya's Skill 2.1 million times, with probes designed to extract her decision rules. That is not learning. That is harvesting.",
  },
  {
    id: "pa-signature",
    power: 3,
    text: () =>
      "The audit matched her signature heuristics, the quirks she spent four years developing. Coincidence does not reproduce a fingerprint.",
  },
  {
    id: "pa-market",
    power: 2,
    text: () =>
      "After the update, her market vanished. The platform did not compete with her product. It absorbed it, then sold the absorption as a feature.",
  },
  {
    id: "pa-consent",
    power: 2,
    text: () =>
      "She sold calls to her Skill. She never sold the right to become the Skill. Consent to be used is not consent to be replaced.",
  },
];

const DEF_ARGS = [
  {
    id: "da-learn",
    power: 3,
    attacks: ["pa-scale", "ev-logs"],
    text: () =>
      "Every expert learned by studying other experts' work. A model that answers probe questions is doing what every junior engineer does with a senior's code reviews, only faster.",
  },
  {
    id: "da-ideas",
    power: 2,
    attacks: ["pa-signature", "ev-similarity"],
    text: () =>
      "Heuristics are ideas, and ideas are not property. The prosecution is asking this court to make it illegal to learn from anything you were allowed to read.",
  },
  {
    id: "da-market",
    power: 2,
    attacks: ["pa-market", "ev-sales"],
    text: () =>
      "Markets move. A better base model helps millions of developers, including, frankly, Maya's own customers. Lost sales are competition, not a crime scene.",
  },
  {
    id: "da-consent",
    power: 2,
    attacks: ["pa-consent", "ev-tos"],
    text: () =>
      "The terms were on the page when she listed the Skill. You cannot accept a marketplace's rules, take its distribution, and call the same rules theft when they cut the other way.",
  },
];

const WITNESS_LINES = [
  {
    id: "w-build",
    text: () =>
      "I spent four years turning code review into that Skill. Every heuristic is a scar from a real outage, a real 3 a.m. page. It is my craft, written down.",
  },
  {
    id: "w-probes",
    text: () =>
      "I watched the probe traffic in my dashboard. Nobody uses a review tool like that. Those prompts were an interrogation, thousands of edge cases, all in eleven days.",
  },
  {
    id: "w-customers",
    text: () =>
      "A customer wrote to me: why pay for your Skill when the base model does it now? He was right. That is the worst part. He was right.",
  },
];

// ---------- the trial ----------
function runTrial(seed) {
  const rand = mulberry32(seed);
  const agents = makeAgents();
  const steps = []; // transcript + decision ledger, one entry per turn
  const state = {
    prosScore: 0,
    defScore: 0,
    evidencePlayed: [],
    lastClaim: null, // {agentId, argId, power}
    concessions: 0,
    rebuttalWins: 0,
    round: 0,
  };

  function say(agentId, kind, text, decision, why, delta) {
    steps.push({
      n: steps.length + 1,
      agent: agentId,
      kind,
      text,
      decision,
      why,
      pros: state.prosScore,
      def: state.defScore,
    });
    if (delta) {
      state.prosScore += delta.pros || 0;
      state.defScore += delta.def || 0;
      const s = steps[steps.length - 1];
      s.pros = state.prosScore;
      s.def = state.defScore;
    }
  }

  function pickFresh(pool, agent) {
    const fresh = pool.filter((a) => !agent.usedArgs.includes(a.id));
    const src = fresh.length ? fresh : pool;
    const choice = src[Math.floor(rand() * src.length)];
    agent.usedArgs.push(choice.id);
    return choice;
  }

  // ----- Opening statements -----
  say(
    "judge", "procedure",
    `Court is in session. ${CASE.title}. The charge: ${CASE.charge} Both sides will be heard. The verdict will rest only on what is shown here.`,
    "Open the trial",
    "Standing order: verdict from evidence presented in the room, nothing else."
  );
  say(
    "prosecutor", "opening",
    `Maya Chen built ${CASE.skill} over four years and sold it, call by call. SkillVault took the calls, all ${CASE.facts.calls} of them, and folded her craft into its model. She was never asked. She was never paid.`,
    "Frame the case as taking, not learning",
    "The jury must hear the scale first; scale is what separates study from extraction."
  );
  state.lastClaim = { agentId: "prosecutor", argId: "opening", power: 2 };
  say(
    "defense", "opening",
    "My client is accused of learning. Every model, and every human expert, improves by studying good work it was allowed to access. No code was copied. No weights were copied. Learning is not a crime this court should invent.",
    "Frame the case as learning, not taking",
    "If the frame is learning, the prosecution must prove a copied thing exists. It does not."
  );
  state.lastClaim = { agentId: "defense", argId: "opening", power: 2 };

  // ----- Evidence rounds -----
  const deck = [...EVIDENCE].sort(() => rand() - 0.5);
  const rounds = 3;
  for (let r = 0; r < rounds; r++) {
    state.round = r + 1;
    // Prosecution presents its next evidence card (or its strongest argument)
    const card = deck.find(
      (c) => c.side === "pros" && !state.evidencePlayed.includes(c.id)
    );
    if (card && r < 2) {
      state.evidencePlayed.push(card.id);
      say(
        "prosecutor", "evidence",
        `Exhibit ${state.evidencePlayed.length}: ${card.title}. ${card.text}`,
        `Present evidence: ${card.title}`,
        `Strength ${card.strength}. Hard records move the judge more than rhetoric.`,
        { pros: card.strength }
      );
      state.lastClaim = { agentId: "prosecutor", argId: card.id, power: card.strength };
    } else {
      const arg = pickFresh(PROS_ARGS, agents.prosecutor);
      say(
        "prosecutor", "argument",
        arg.text(),
        `Argue: ${arg.id.replace("pa-", "")}`,
        "Evidence is on the table; now press the interpretation before the defense reframes it.",
        { pros: arg.power - 1 }
      );
      state.lastClaim = { agentId: "prosecutor", argId: arg.id, power: arg.power };
    }

    // Witness testifies in round 1, reacts afterwards
    if (r === 0) {
      const line = pickFresh(WITNESS_LINES, agents.witness);
      say(
        "witness", "testimony",
        line.text(),
        "Testify to the work itself",
        "The court needs to understand the Skill is four years of craft, not a data file."
      );
    } else if (state.lastClaim && state.lastClaim.agentId === "defense") {
      const line = pickFresh(WITNESS_LINES, agents.witness);
      say(
        "witness", "reaction",
        line.text(),
        "Answer the defense's framing with a fact from the dashboard",
        "Abstract arguments about learning die when a specific person describes a specific loss."
      );
    }

    // Defense responds: concede crushing evidence, rebut what it can, else reframe
    const target = state.lastClaim;
    const defCard = deck.find(
      (c) => c.side === "def" && !state.evidencePlayed.includes(c.id)
    );
    const crushing = target && target.power >= 3 && agents.defense.conceded.length < 1;
    if (crushing && rand() > 0.45) {
      agents.defense.conceded.push(target.argId);
      state.concessions += 1;
      say(
        "defense", "concession",
        `The defense does not contest the ${target.argId.startsWith("ev") ? "record" : "point"}. The volume happened. Volume is not the charge. The charge requires a copied, protected thing, and the prosecution still has not shown one.`,
        `Concede the ${target.argId} point, narrow the case`,
        "Contesting a strength-3 record would cost credibility with the judge. Conceding it buys trust for the legal argument that matters.",
        { pros: -1, def: 1 }
      );
      state.lastClaim = { agentId: "defense", argId: "concession", power: 2 };
    } else {
      const rebuttal = DEF_ARGS.filter(
        (a) => a.attacks.includes(target ? target.argId : "") && !agents.defense.usedArgs.includes(a.id)
      );
      const targeted = rebuttal.length > 0;
      const arg = targeted ? rebuttal[0] : pickFresh(DEF_ARGS, agents.defense);
      agents.defense.usedArgs.push(arg.id);
      const wins = arg.power >= (target ? target.power : 2);
      if (wins) state.rebuttalWins += 1;
      say(
        "defense", "rebuttal",
        arg.text(),
        `Rebut with: ${arg.id.replace("da-", "")}`,
        wins
          ? "This answer matches the prosecution's last claim head-on and is at least as strong."
          : "No clean answer exists for that claim; contest it anyway to stop it standing unopposed.",
        wins ? { def: targeted ? arg.power : arg.power - 1 } : { def: 0, pros: 1 }
      );
      state.lastClaim = { agentId: "defense", argId: arg.id, power: arg.power };
    }

    // Defense plays its own evidence in rounds 2 and 3
    if (r >= 1 && defCard) {
      state.evidencePlayed.push(defCard.id);
      say(
        "defense", "evidence",
        `Defense exhibit: ${defCard.title}. ${defCard.text}`,
        `Present evidence: ${defCard.title}`,
        "A document beats an assertion; put the terms and the forensics in front of the judge.",
        { def: defCard.strength }
      );
      state.lastClaim = { agentId: "defense", argId: defCard.id, power: defCard.strength };
      const answer = pickFresh(PROS_ARGS, agents.prosecutor);
      say(
        "prosecutor", "argument",
        answer.text(),
        "Answer the defense exhibit immediately",
        "If the exhibit stands unanswered into the closing, the judge will treat it as settled.",
        { pros: 1 }
      );
      state.lastClaim = { agentId: "prosecutor", argId: answer.id, power: answer.power };
    }

    // Judge notes the state of play
    const lean =
      state.prosScore === state.defScore
        ? "This case is level"
        : state.prosScore > state.defScore
          ? "The prosecution's record is heavier so far"
          : "The defense's framing is holding so far";
    say(
      "judge", "ruling",
      `${lean}. ${state.concessions ? "The court notes the defense conceded a point of fact and argues law; that candor is recorded. " : ""}Continue.`,
      "Log the balance and any concessions",
      "A visible running balance keeps both sides honest about what still needs proving."
    );
  }

  // ----- Closings -----
  say(
    "prosecutor", "closing",
    "Strip away the vocabulary and one fact remains: a platform took an expert's life's work through a pipe she opened for customers, and sold it back to her own market. If that is legal, then no expert will ever share a Skill again, and every model will be trained on a world that stopped teaching.",
    "Close on the consequence for all experts",
    "The verdict sets the rule for every expert watching, not only for Maya."
  );
  say(
    "defense", "closing",
    "The prosecution proved use. It never proved theft. Everything my client touched, it was given access to, under terms the witness accepted. Punish learning itself, and this court will not protect experts. It will freeze them, mid-century, while the world learns elsewhere.",
    "Close on the missing element: a copied thing",
    "The charge needs a protected object that was taken. Four hours in, there still is not one."
  );

  // ----- Verdict: computed from the room -----
  const noise = Math.floor(rand() * 5) - 2; // -2..+2
  const margin = state.prosScore - state.defScore + noise;
  let verdict, verdictText;
  const topEvidence = state.evidencePlayed.length
    ? state.evidencePlayed.join(", ")
    : "none";
  if (margin >= 3) {
    verdict = "LIABLE";
    verdictText =
      `Verdict: SkillVault is liable. The records shown here (${topEvidence}) establish extraction at a scale no honest word can call study, and the harm is documented, not alleged. SkillVault will pay Maya Chen ${CASE.facts.lostSales} and a royalty on the distilled capability. Experts keep the rights to what their craft produces.`;
  } else if (margin <= -3) {
    verdict = "NOT LIABLE";
    verdictText =
      "Verdict: not liable. The prosecution proved that a model learned from work it could access, and learning, without a copied protected object, is not taking. The court shares the witness's unease, but unease is not a verdict. This is a question for lawmakers, not for this bench.";
  } else {
    verdict = "SETTLEMENT ORDERED";
    verdictText =
      `Verdict: the court orders a settlement. The evidence cuts both ways: real extraction, real consent problems, and no copied code. SkillVault will pay Maya Chen a licensing fee for ${CASE.skill} and label distilled capabilities in its model card. Neither side gets the principle it wanted. Both sides get a rule they can build on.`;
  }
  say(
    "judge", "verdict",
    verdictText,
    `Reach verdict: ${verdict}`,
    `Final balance: prosecution ${state.prosScore}, defense ${state.defScore}, deliberation margin ${margin}. Concessions recorded: ${state.concessions}. Rebuttals that landed: ${state.rebuttalWins}. The verdict follows the room, not a script.`
  );

  return {
    seed,
    caseTitle: CASE.title,
    verdict,
    margin,
    steps,
    finalScores: { pros: state.prosScore, def: state.defScore },
    agents: Object.values(agents).map((a) => ({
      id: a.id, name: a.name, role: a.role, goal: a.goal, color: a.color,
    })),
  };
}

// Node test hook
if (typeof module !== "undefined" && module.exports) {
  module.exports = { runTrial };
}
if (typeof window !== "undefined") {
  window.CourtEngine = { runTrial };
}
