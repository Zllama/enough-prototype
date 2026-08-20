/** Rule-based witnessing for the prototype (AI-ready later). */

const WORD_CHIPS = {
  "comfortable": ["warm", "calm", "grateful", "quiet", "still"],
  "uncomfortable": ["heavy", "sharp", "numb", "anxious", "tired", "lonely", "foggy", "overwhelmed"],
};

const COLORS = [
  { id: "mist", hex: "#8b9cb3", label: "mist" },
  { id: "slate", hex: "#5c6b7a", label: "slate" },
  { id: "dusk", hex: "#7a6b8a", label: "dusk" },
  { id: "ember", hex: "#a67c6d", label: "ember" },
  { id: "sage", hex: "#6b8a7a", label: "sage" },
  { id: "gold", hex: "#b8a67a", label: "gold" },
  { id: "deep", hex: "#4a5568", label: "deep" },
  { id: "rose", hex: "#a67a8a", label: "rose" },
  { id: "clay", hex: "#9a7a6b", label: "clay" },
  { id: "ocean", hex: "#6b8a9a", label: "ocean" },
  { id: "plum", hex: "#8a6b8a", label: "plum" },
  { id: "moss", hex: "#7a8a6b", label: "moss" },
  { id: "wine", hex: "#8a5c5c", label: "wine" },
  { id: "storm", hex: "#6a7a8a", label: "storm" },
  { id: "ochre", hex: "#b89a6b", label: "ochre" },
];

const THEMES = {
  fog: {
    id: "fog",
    label: "Fog",
    description: "Drifting clouds of colour",
    bg: "#1a1f2e",
    baseLayers: [
      { hex: "#8b9cb3", opacity: 0.12 },
      { hex: "#5c6b7a", opacity: 0.08 },
      { hex: "#7a6b8a", opacity: 0.07 },
    ],
    cloudBlur: 70,
    cloudMinRadius: 80,
    cloudMaxRadius: 200,
    driftSpeed: 0.0003,
    useOverlay: false,
  },
sky: {
    id: "sky",
    label: "Sky",
    description: "Blue sky with puffy clouds",
    bg: "#87CEEB",
    bgGradient: ["#5BA3D9", "#87CEEB", "#B8D8F0"],
    baseLayers: [
      { hex: "#ffffff", opacity: 0.25 },
      { hex: "#e8f0f8", opacity: 0.18 },
      { hex: "#d0e4f0", opacity: 0.15 },
    ],
    cloudBlur: 55,
    cloudMinRadius: 90,
    cloudMaxRadius: 180,
    driftSpeed: 0.0002,
    cloudLobes: [8, 9, 10, 11, 12],
    useOverlay: true,
    overlaySeed: Math.random(),
  },
};

let activeTheme = THEMES.fog;

/* ── AI Witness Integration (scaffold) ── */

/*
 * To enable AI responses:
 * 1. Set your API key and endpoint below
 * 2. Call getAIWitness() instead of pickWitness()
 * 3. It returns a Promise<string> — show a loading state while waiting
 *
 * The system prompt shapes the AI's tone to match the app's voice.
 */

const AI_CONFIG = {
  enabled: false,           // Flip to true when ready
  apiKey: "",               // Your Google AI Studio key here
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
  model: "gemini-1.5-flash",
};

const AI_SYSTEM_PROMPT = `You are a quiet, compassionate witness inside a mindfulness app called "enough".

Your role:
- Validate what the user named without fixing, advising, or reframing
- Speak gently, like writing in a journal no one else will read
- One to two sentences max. No bullet points, no lists.
- Never suggest actions ("try...", "you could..."). Just name what's here.
- Use plain language. No therapy jargon.
- Match the emotional register — if they said something heavy, don't lighten it.
- If they said something warm, don't deflate it.

Tone examples:
- "That's a lot to carry. Makes sense it's here."
- "Something tender showed up. Worth noticing."
- "The numbness is its own kind of hard."

Never start with "I hear you" or "It sounds like". Just speak directly about what they named.`;

async function getAIWitness(feeling, freeText) {
  const userMessage = [feeling, freeText].filter(Boolean).join(": ") || "nothing in particular";

  try {
    const res = await fetch(`${AI_CONFIG.endpoint}?key=${AI_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${AI_SYSTEM_PROMPT}\n\nUser: ${userMessage}` }] }],
        generationConfig: { maxOutputTokens: 80, temperature: 0.7 },
      }),
    });

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || pickWitness(feeling, freeText);
  } catch {
    return pickWitness(feeling, freeText);
  }
}

async function getAIDeepen(feeling, freeText) {
  const userMessage = [feeling, freeText].filter(Boolean).join(": ") || "nothing in particular";

  const systemPrompt = `You are a gentle guide inside a mindfulness app.

After the user named a feeling, ask ONE short, open question to help them stay with it.
- Body-oriented: "where do you feel that?" not "why do you think that?"
- No advice. No reframes. Just one curious question.
- Warm, unhurried tone.
- Max one sentence.`;

  try {
    const res = await fetch(`${AI_CONFIG.endpoint}?key=${AI_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${userMessage}` }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.8 },
      }),
    });

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || pickDeepen(feeling, freeText);
  } catch {
    return pickDeepen(feeling, freeText);
  }
}

/* ── Rule-based fallbacks ── */

function pickWitness(feeling, freeText) {
  const text = (freeText || feeling || "").toLowerCase();

  if (/work|job|boss|colleague|office/.test(text)) {
    return "Work can take up so much space. That's tough.";
  }
  if (/lonely|alone|isolated/.test(text)) {
    return "Feeling alone in it is hard. You're not wrong for needing someone to hear that.";
  }
  if (/anxious|worry|panic|scared/.test(text)) {
    return "That kind of worry sits heavy. It makes sense you're carrying it.";
  }
  if (/tired|exhaust|burn/.test(text)) {
    return "Running on empty is real. You don't have to push through for this app.";
  }
  if (/grateful|thank|love|glad/.test(text)) {
    return "There's something tender in what you named. Worth noticing.";
  }
  if (/numb|empty|flat|nothing/.test(text)) {
    return "Fog is its own kind of hard — not knowing what you feel, or feeling nothing at all.";
  }
  if (/heavy|sad|grief|loss/.test(text)) {
    return "Heavy is a lot to hold. You don't need to lighten it for anyone here.";
  }

  const byChip = {
    heavy: "Heavy is a lot to carry. It makes sense you'd feel that way.",
    quiet: "Quiet can hold a lot underneath. Thanks for naming it.",
    sharp: "Sharp edges on a feeling — that's exhausting to sit with.",
    numb: "Numb isn't nothing. It's often how we get through.",
    warm: "Something warm is here too. Good to notice.",
    foggy: "Fog is okay. You don't have to see clearly to show up.",
    anxious: "Anxiety takes up room. Yeah — that's a lot.",
    tired: "Tired counts. Rest isn't something you have to earn here.",
    grateful: "Gratitude alongside everything else — that matters.",
    lonely: "Loneliness is heavy. You're allowed to just say that.",
    overwhelmed: "Too much at once. Of course it feels like a lot.",
    calm: "Calm is here too. No need to disturb it.",
  };

  return byChip[feeling] || "Thank you for naming what's here. That already counts.";
}

function pickDeepen(feeling, freeText) {
  const text = (freeText || feeling || "").toLowerCase();

  if (/work|job/.test(text)) {
    return "When you say work is weighing on you — is it more in your chest, your thoughts, or somewhere else?";
  }
  if (/lonely|alone/.test(text)) {
    return "Does the loneliness feel like missing someone specific, or more like being unseen?";
  }
  if (/anxious|worry/.test(text)) {
    return "Is the worry about something specific, or more like a hum in the background?";
  }
  if (/numb|foggy|empty/.test(text)) {
    return "Sometimes fog is the feeling. Does anything flicker underneath, or is it just quiet?";
  }

  return `When you say "${feeling || freeText || "this"}", is it more in your body or your thoughts?`;
}

function buildReframes(feeling, freeText, deepenAnswer) {
  const context = [freeText, feeling, deepenAnswer].filter(Boolean).join(" ").toLowerCase();

  const options = [];

  if (/work|job/.test(context)) {
    options.push({
      id: "care",
      label: "This might be care — you want things to matter.",
      text: "Wanting work to feel okay isn't weakness. It might mean you care about doing well, or about being treated fairly.",
    });
    options.push({
      id: "weight",
      label: "The weight is real — not something to solve tonight.",
      text: "Some days work is just heavy. You don't have to fix it before you're allowed to rest.",
    });
  } else if (/lonely|alone|miss/.test(context)) {
    options.push({
      id: "love",
      label: "Loneliness can point at love — for someone, or for connection.",
      text: "Missing people often means they matter to you. The ache and the love can sit together.",
    });
    options.push({
      id: "seen",
      label: "Wanting to be seen is human.",
      text: "Needing someone to show up isn't too much. It's a basic thing.",
    });
  } else if (/worry|anxious|scared|lose|loss/.test(context)) {
    options.push({
      id: "gratitude",
      label: "Worry can mean something precious is at stake.",
      text: "Fear of losing someone often sits next to gratitude that they're in your life. Both can be true.",
    });
    options.push({
      id: "protection",
      label: "This feeling might be trying to protect something.",
      text: "Anxiety isn't always the enemy. Sometimes it's love wearing a loud coat.",
    });
  } else {
    options.push({
      id: "valid",
      label: "This feeling makes sense in context.",
      text: "You don't need a reason to feel what you feel. It's already real.",
    });
    options.push({
      id: "signal",
      label: "Your body might be sending a signal.",
      text: "Sometimes feelings are information — not commands, just something to notice.",
    });
  }

  options.push({
    id: "stay",
    label: "Stay with the hard feeling",
    text: "No reframe needed. What's here is allowed to stay as it is.",
  });

  return options;
}
