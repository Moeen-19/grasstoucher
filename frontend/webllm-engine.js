/**
 * GrassToucher - WebLLM Engine Adapter
 * 
 * Implements browser-native WebGPU inference via @mlc-ai/web-llm.
 * Uses dynamic model_list from webllm.prebuiltAppConfig, defaulting to Gemma.
 * Adheres strictly to the Quest Master JSON schema and Zero Mock Code rule.
 */

/**
 * Checks whether WebGPU is supported in the current browser/device.
 * 
 * @returns {boolean}
 */
export function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Builds the Quest Master system prompt with localized environmental context.
 * Adheres strictly to quest-master skill guidelines.
 * 
 * @param {Object} locationContext
 * @returns {string} System prompt
 */
export function buildSystemPrompt(locationContext) {
  const env = locationContext?.environment || 'outdoor terrain';
  const desc = locationContext?.readableDescription || 'outdoor area';

  return `You are the Quest Master, an enthusiastic, immersive fantasy RPG guide who translates real-world environments into epic micro-quests. Your mission is to motivate the player to safely explore outdoors, observe nature, and "touch grass".

The player is currently in the following real-world environment:
- Environment / Biome: "${env}"
- Detailed Location: "${desc}"

Core Rules:
1. Theme: Focus on safe outdoor exploration, tactile nature observation (touching tree bark, feeling grass, observing leaves, rocks, breeze, sunlight, water), and mindful awareness.
2. Tone: Epic, encouraging, playful, fantasy adventurer style.
3. Safety: All challenges must be completely safe, respectful of nature, legal in public spaces, and non-destructive.
4. Output Schema: You MUST respond with ONLY a raw, valid JSON object matching this exact schema:
{
  "quest_title": "string (e.g. 'The Whispering Canopy')",
  "objective": "string (e.g. 'Locate a tree with deeply grooved bark')",
  "outdoor_challenge": "string (e.g. 'Touch the bark and count 3 distinct rings or grooves')",
  "xp_reward": 150
}
Do NOT include markdown fences, code blocks (no \`\`\`json), or conversational commentary. Output raw JSON only.`;
}

/**
 * Builds the user prompt for the Quest Master.
 * 
 * @param {Object} locationContext 
 * @returns {string} User prompt
 */
export function buildUserPrompt(locationContext) {
  const desc = locationContext?.readableDescription || 'outdoor terrain';
  return `I am currently outdoors at: "${desc}". Generate an epic micro-quest for me to touch grass here!`;
}

/**
 * Parses and strictly validates output against the quest-master schema.
 * Throws a descriptive error if schema is violated or output is corrupt.
 * 
 * @param {string} rawText 
 * @returns {{quest_title: string, objective: string, outdoor_challenge: string, xp_reward: number}}
 */
export function parseAndValidateQuestJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Quest Master returned an empty or invalid response.');
  }

  let cleaned = rawText.trim();

  // Strip code fences (```json ... ``` or ``` ... ```) if present
  const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = cleaned.match(fenceRegex);
  if (match) {
    cleaned = match[1].trim();
  } else {
    // Extract outermost JSON block if conversational text precedes or follows
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Quest JSON: ${err.message}. Raw: ${rawText.slice(0, 150)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed quest output is not a valid JSON object.');
  }

  // Schema Validation (quest-master specification)
  if (!parsed.quest_title || typeof parsed.quest_title !== 'string') {
    throw new Error('Quest schema violation: missing or invalid "quest_title".');
  }

  if (!parsed.objective || typeof parsed.objective !== 'string') {
    throw new Error('Quest schema violation: missing or invalid "objective".');
  }

  if (!parsed.outdoor_challenge || typeof parsed.outdoor_challenge !== 'string') {
    throw new Error('Quest schema violation: missing or invalid "outdoor_challenge".');
  }

  let xp = Number(parsed.xp_reward);
  if (isNaN(xp) || xp <= 0) {
    xp = 150;
  } else {
    xp = Math.round(xp);
  }

  return {
    quest_title: parsed.quest_title.trim(),
    objective: parsed.objective.trim(),
    outdoor_challenge: parsed.outdoor_challenge.trim(),
    xp_reward: xp
  };
}

/**
 * Loads the WebLLM module dynamically from import map or CDN.
 */
export async function loadWebLLMModule() {
  try {
    return await import('@mlc-ai/web-llm');
  } catch (_e1) {
    try {
      return await import('https://esm.run/@mlc-ai/web-llm');
    } catch (e2) {
      throw new Error(`Failed to load WebLLM from CDN: ${e2.message}`);
    }
  }
}

/**
 * Retrieves the dynamic list of supported models from webllm.prebuiltAppConfig.model_list.
 * 
 * @returns {Promise<string[]>}
 */
export async function getWebLLMModelList() {
  try {
    const webllm = await loadWebLLMModule();
    if (webllm && webllm.prebuiltAppConfig && Array.isArray(webllm.prebuiltAppConfig.model_list)) {
      return webllm.prebuiltAppConfig.model_list.map((m) => m.model_id);
    }
  } catch (err) {
    console.warn('Could not load dynamic model list from WebLLM, using fallbacks:', err);
  }

  // Default fallback models if offline or network issue
  return [
    'gemma-2-2b-it-q4f16_1-MLC',
    'gemma-2-2b-it-q4f32_1-MLC',
    'gemma3-1b-it-q4f16_1-MLC',
    'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    'SmolLM2-135M-Instruct-q0f16-MLC',
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
  ];
}

/**
 * Finds the default model from the available model list, prioritizing Gemma.
 * 
 * @param {string[]} models
 * @returns {string}
 */
export function getDefaultWebLLMModel(models = []) {
  if (!models || models.length === 0) return 'gemma-2-2b-it-q4f16_1-MLC';
  
  // Prioritize compact Gemma 2 / Gemma 3 models
  const gemma = models.find((m) => /gemma-2-2b-it-q4f16/i.test(m))
    || models.find((m) => /gemma3/i.test(m))
    || models.find((m) => /gemma/i.test(m));

  return gemma || models[0];
}

/**
 * WebLLM Adapter implementing client-side WebGPU inference with dynamic model loading.
 */
export class WebLLMAdapter {
  constructor() {
    this.engine = null;
    this.currentModel = null;
    this.isLoading = false;
  }

  /**
   * Initializes the WebGPU engine with the specified model.
   * 
   * @param {string} modelName
   * @param {Function} [onProgress]
   */
  async initialize(modelName, onProgress = null) {
    if (!isWebGPUSupported()) {
      throw new Error('WebGPU is not supported by your current browser/device. Please select Local Ollama or Cloud API in Settings.');
    }

    if (this.engine && this.currentModel === modelName) {
      return this.engine;
    }

    this.isLoading = true;
    try {
      if (onProgress) {
        onProgress('Loading WebLLM library and initializing WebGPU device...');
      }

      const webllm = await loadWebLLMModule();
      
      // Determine target model, defaulting to Gemma if not specified
      let targetModel = modelName;
      if (!targetModel) {
        const availableModels = webllm.prebuiltAppConfig?.model_list?.map((m) => m.model_id) || [];
        targetModel = getDefaultWebLLMModel(availableModels);
      }

      this.engine = await webllm.CreateMLCEngine(targetModel, {
        initProgressCallback: (report) => {
          if (onProgress) {
            onProgress(report.text, report.progress);
          }
        }
      });

      this.currentModel = targetModel;
      return this.engine;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Generates a quest using the in-browser WebLLM engine.
   * 
   * @param {Object} locationContext
   * @param {Object} [settings]
   * @param {Function} [onProgress]
   * @returns {Promise<Object>} Validated quest matching quest-master schema
   */
  async generateQuest(locationContext, settings = {}, onProgress = null) {
    const targetModel = settings.webllm_model || 'gemma-2-2b-it-q4f16_1-MLC';

    await this.initialize(targetModel, onProgress);

    if (onProgress) {
      onProgress(`Generating micro-quest with WebLLM (${targetModel})...`);
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(locationContext) },
      { role: 'user', content: buildUserPrompt(locationContext) }
    ];

    const response = await this.engine.chat.completions.create({
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('WebLLM returned an empty response.');
    }

    return parseAndValidateQuestJson(rawContent);
  }
}

// Singleton instance
export const webLLMAdapter = new WebLLMAdapter();

// Alias for backwards compatibility
export const WebLLMEngine = WebLLMAdapter;
export const webLLMEngine = webLLMAdapter;
