/**
 * GrassToucher: The Real-World RPG
 * Main Application Orchestrator & UI State Controller
 */

import {
  isWebGPUSupported,
  webLLMAdapter,
  parseAndValidateQuestJson,
  buildSystemPrompt,
  buildUserPrompt,
  getWebLLMModelList,
  getDefaultWebLLMModel
} from './webllm-engine.js';

// Default Application Configuration
export const DEFAULT_SETTINGS = {
  provider_mode: 'webllm', // 'webllm' | 'ollama' | 'cloud'
  webllm_model: 'gemma-2-2b-it-q4f16_1-MLC', // Default to Gemma if available
  ollama_endpoint: 'http://localhost:11434',
  ollama_model: 'llama3.2',
  cloud_endpoint: 'https://api.openai.com/v1',
  cloud_api_key: '',
  cloud_model: 'gpt-4o-mini',
  elevenlabs_api_key: '',
  sentry_dsn: ''
};

export const STORAGE_KEY = 'grasstoucher_settings';
export const PLAYER_STORAGE_KEY = 'grasstoucher_player';

// ==============================================================
// Phase 2: Geolocation & Environment Translation Helpers
// ==============================================================

/**
 * Captures the user's real-world coordinates via the HTML5 Geolocation API.
 * 
 * @param {Object} [options] - Geolocation options
 * @param {Object} [geolocationProvider] - Optional navigator.geolocation override
 * @returns {Promise<GeolocationPosition>}
 */
export function getBrowserCoordinates(options = {}, geolocationProvider = null) {
  return new Promise((resolve, reject) => {
    const geo = geolocationProvider || (typeof navigator !== 'undefined' ? navigator.geolocation : null);
    if (!geo) {
      reject(new Error('HTML5 Geolocation is not supported by your browser/device.'));
      return;
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
      ...options
    };

    geo.getCurrentPosition(resolve, reject, defaultOptions);
  });
}

/**
 * Reverse geocodes coordinates into location details using OpenStreetMap Nominatim.
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>}
 */
export async function reverseGeocodeNominatim(latitude, longitude) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&format=jsonv2&addressdetails=1`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim reverse geocoding failed with status: ${response.status}`);
  }

  return await response.json();
}

/**
 * Translates OpenStreetMap Nominatim response into a clean, readable outdoor RPG environment description.
 * Specifically produces labels such as "city park", "suburban sidewalk", "hiking trail".
 * 
 * @param {Object} data - Nominatim jsonv2 response object
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Object} Translated environment metadata
 */
export function translateEnvironment(data, latitude, longitude) {
  if (!data) {
    return {
      environment: 'outdoor terrain',
      readableDescription: `outdoor terrain (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`,
      poiName: '',
      locality: '',
      fullAddress: ''
    };
  }

  const category = (data.category || '').toLowerCase();
  const type = (data.type || '').toLowerCase();
  const address = data.address || {};
  const name = data.name || address.park || address.leisure || address.natural || '';
  const road = address.road || address.pedestrian || address.footway || address.path || address.cycleway || '';
  const suburb = address.suburb || address.quarter || address.neighbourhood || '';
  const city = address.city || address.town || address.village || address.municipality || address.county || '';

  let environment = 'suburban sidewalk';

  // 1. Parks, Gardens, and Green Spaces
  if (
    type === 'park' ||
    address.park ||
    (category === 'leisure' && ['park', 'garden', 'nature_reserve', 'playground', 'pitch'].includes(type)) ||
    address.leisure === 'park'
  ) {
    if (type === 'garden') environment = 'botanical garden';
    else if (type === 'nature_reserve') environment = 'nature reserve';
    else if (type === 'playground') environment = 'neighborhood park';
    else environment = 'city park';
  }
  // 2. Natural Areas, Woods, Beaches, and Meadows
  else if (category === 'natural' || ['wood', 'forest', 'scrub', 'grassland', 'beach', 'water', 'wetland'].includes(type)) {
    if (['wood', 'forest'].includes(type) || address.natural === 'wood') environment = 'wooded forest';
    else if (type === 'beach' || address.natural === 'beach') environment = 'sandy beach / coastline';
    else if (['grassland', 'meadow'].includes(type)) environment = 'open meadow';
    else environment = 'natural outdoor area';
  }
  // 3. Hiking Trails, Walking Paths, and Footways
  else if (
    ['footway', 'path', 'track', 'bridleway', 'hiking', 'trail'].includes(type) ||
    /trail|path|walk|hike|greenway/i.test(road)
  ) {
    environment = 'hiking trail';
  }
  // 4. Bike Paths & Greenways
  else if (type === 'cycleway') {
    environment = 'bike path / greenway';
  }
  // 5. Pedestrian Walkways & Plazas
  else if (['pedestrian', 'living_street'].includes(type) || (category === 'highway' && type === 'pedestrian')) {
    environment = 'pedestrian walkway';
  }
  // 6. Outdoor Benches & Rest Stops
  else if (type === 'bench') {
    environment = road && /park|green|concourse|drive/i.test(road) ? 'city park' : 'suburban sidewalk';
  }
  // 7. Roads / Urban vs Suburban Sidewalks
  else if (category === 'highway' || road) {
    if (['secondary', 'primary', 'tertiary', 'trunk', 'motorway'].includes(type)) {
      environment = 'urban sidewalk';
    } else {
      environment = 'suburban sidewalk';
    }
  }
  // 8. Landuse Classifications
  else if (category === 'landuse') {
    if (['forest', 'wood'].includes(type)) environment = 'wooded forest';
    else if (['grass', 'meadow', 'recreation_ground', 'village_green'].includes(type)) environment = 'city park';
    else if (['residential'].includes(type)) environment = 'suburban sidewalk';
    else environment = 'outdoor terrain';
  }
  // 9. Educational & Campus Grounds
  else if (category === 'amenity' && ['university', 'college', 'school'].includes(type)) {
    environment = 'campus grounds';
  }

  // Construct readable context title
  const contextName = name || road || suburb || '';
  const area = suburb && city && suburb !== city ? `${suburb}, ${city}` : (city || suburb || '');

  let readableDescription = environment;
  if (contextName && area) {
    readableDescription = `${environment} (${contextName}, ${area})`;
  } else if (contextName) {
    readableDescription = `${environment} (${contextName})`;
  } else if (area) {
    readableDescription = `${environment} (${area})`;
  }

  return {
    environment,
    readableDescription,
    poiName: name || road,
    locality: area,
    fullAddress: data.display_name || ''
  };
}

// ==============================================================
// Phase 3: AI Adapters & Strategy Pattern
// ==============================================================

/**
 * Base AI Adapter defining the contract for Quest Master inference.
 */
export class BaseAIAdapter {
  /**
   * Generates a quest adhering strictly to the quest-master JSON schema.
   * 
   * @param {Object} locationContext
   * @param {Object} settings
   * @param {Function} [onProgress]
   * @returns {Promise<Object>}
   */
  async generateQuest(_locationContext, _settings, _onProgress) {
    throw new Error('generateQuest() must be implemented by concrete adapter.');
  }
}

/**
 * Local Ollama Adapter targeting local daemon (default http://localhost:11434).
 */
export class OllamaAdapter extends BaseAIAdapter {
  async generateQuest(locationContext, settings = {}, onProgress = null) {
    const rawEndpoint = settings.ollama_endpoint || 'http://localhost:11434';
    const endpoint = rawEndpoint.replace(/\/+$/, '');
    const model = settings.ollama_model || 'llama3.2';

    if (onProgress) {
      onProgress(`Connecting to local Ollama (${endpoint}) with model "${model}"...`);
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(locationContext) },
      { role: 'user', content: buildUserPrompt(locationContext) }
    ];

    const targetUrl = `${endpoint}/api/chat`;

    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.7
          }
        })
      });
    } catch (netErr) {
      throw new Error(`Cannot connect to Ollama at "${endpoint}". Ensure Ollama is running and CORS allows browser connections ('OLLAMA_ORIGINS="*" ollama serve'). Error: ${netErr.message}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama request failed (HTTP ${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.message?.content;
    if (!rawContent) {
      throw new Error('Ollama returned empty response content.');
    }

    return parseAndValidateQuestJson(rawContent);
  }
}

/**
 * Cloud API Adapter targeting OpenAI or compatible REST endpoints.
 */
export class CloudAPIAdapter extends BaseAIAdapter {
  async generateQuest(locationContext, settings = {}, onProgress = null) {
    let rawEndpoint = settings.cloud_endpoint || 'https://api.openai.com/v1';
    rawEndpoint = rawEndpoint.replace(/\/+$/, '');
    const apiKey = settings.cloud_api_key || '';
    const model = settings.cloud_model || 'gpt-4o-mini';

    if (!apiKey) {
      throw new Error('Cloud API key is missing. Please open Settings and enter your API key.');
    }

    if (onProgress) {
      onProgress(`Querying Cloud API (${rawEndpoint}) with model "${model}"...`);
    }

    const targetUrl = rawEndpoint.endsWith('/chat/completions')
      ? rawEndpoint
      : `${rawEndpoint}/chat/completions`;

    const messages = [
      { role: 'system', content: buildSystemPrompt(locationContext) },
      { role: 'user', content: buildUserPrompt(locationContext) }
    ];

    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });
    } catch (netErr) {
      throw new Error(`Failed to contact Cloud API at "${targetUrl}": ${netErr.message}`);
    }

    if (!response.ok) {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await response.text().catch(() => response.statusText);
      }
      throw new Error(`Cloud API returned HTTP ${response.status}: ${errDetail}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Cloud API returned empty choices content.');
    }

    return parseAndValidateQuestJson(rawContent);
  }
}

/**
 * Multi-Provider AI Strategy Router
 */
export class AIRouter {
  constructor(customAdapters = {}) {
    this.adapters = {
      webllm: webLLMAdapter,
      ollama: new OllamaAdapter(),
      cloud: new CloudAPIAdapter(),
      ...customAdapters
    };
  }

  /**
   * Retrieves active adapter for given provider mode.
   * 
   * @param {string} providerMode
   * @returns {BaseAIAdapter}
   */
  getAdapter(providerMode) {
    const adapter = this.adapters[providerMode];
    if (!adapter) {
      throw new Error(`Unsupported AI provider mode: "${providerMode}". Choose "webllm", "ollama", or "cloud".`);
    }
    return adapter;
  }

  /**
   * Generates a quest using the active provider strategy.
   * 
   * @param {Object} locationContext
   * @param {Object} settings
   * @param {Function} [onProgress]
   * @returns {Promise<Object>}
   */
  async generateQuest(locationContext, settings, onProgress) {
    const mode = settings.provider_mode || 'webllm';
    const adapter = this.getAdapter(mode);
    return await adapter.generateQuest(locationContext, settings, onProgress);
  }
}

// ==============================================================
// Main Application Class
// ==============================================================

export class GrassToucherApp {
  constructor(aiRouter = null) {
    this.settings = this.loadSettings();
    this.playerState = this.loadPlayerStats();
    this.activeQuest = null;
    this.locationContext = null;
    this.isAcquiringLocation = false;
    this.isGeneratingQuest = false;
    this.currentAudio = null;

    // AI Strategy Router
    this.aiRouter = aiRouter || new AIRouter();

    this.initElements();
    this.initSentry();
    this.bindEvents();
    this.applySettingsToUI();
    this.updatePlayerStatsUI();
    this.checkWebGPUSupport();
    this.populateWebLLMModelOptions();
  }

  /**
   * Initializes references to DOM elements.
   */
  initElements() {
    // Header & Badges
    this.providerBadgeText = document.getElementById('providerBadgeText');
    this.playerLevel = document.getElementById('playerLevel');
    this.playerXP = document.getElementById('playerXP');
    this.playerQuestsCount = document.getElementById('playerQuestsCount');
    
    // Status Console
    this.statusMessage = document.getElementById('statusMessage');

    // Biome & Geolocation Elements (Phase 2)
    this.biomeDescription = document.getElementById('biomeDescription');
    this.gpsCoordsText = document.getElementById('gpsCoordsText');
    this.gpsSignalDot = document.getElementById('gpsSignalDot');
    this.refreshGpsBtn = document.getElementById('refreshGpsBtn');

    // Settings Modal
    this.settingsModal = document.getElementById('settingsModal');
    this.settingsBackdrop = document.getElementById('settingsBackdrop');
    this.openSettingsBtn = document.getElementById('openSettingsBtn');
    this.footerSettingsBtn = document.getElementById('footerSettingsBtn');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    this.settingsForm = document.getElementById('settingsForm');
    this.settingsFeedback = document.getElementById('settingsFeedback');

    // Settings Inputs & Sections
    this.providerRadios = document.querySelectorAll('input[name="provider_mode"]');
    this.sectionWebllm = document.getElementById('sectionWebllmConfig');
    this.sectionOllama = document.getElementById('sectionOllamaConfig');
    this.sectionCloud = document.getElementById('sectionCloudConfig');

    this.webllmModelSelect = document.getElementById('webllmModelSelect');
    this.ollamaEndpointInput = document.getElementById('ollamaEndpointInput');
    this.ollamaModelInput = document.getElementById('ollamaModelInput');
    this.cloudEndpointInput = document.getElementById('cloudEndpointInput');
    this.cloudApiKeyInput = document.getElementById('cloudApiKeyInput');
    this.cloudModelInput = document.getElementById('cloudModelInput');
    this.elevenlabsApiKeyInput = document.getElementById('elevenlabsApiKeyInput');
    this.sentryDsnInput = document.getElementById('sentryDsnInput');

    // WebGPU Status in Settings
    this.webgpuIndicator = document.getElementById('webgpuIndicator');
    this.webgpuStatusText = document.getElementById('webgpuStatusText');

    // Quest UI Elements
    this.emptyQuestCard = document.getElementById('emptyQuestCard');
    this.activeQuestCard = document.getElementById('activeQuestCard');
    this.questTitle = document.getElementById('questTitle');
    this.questObjective = document.getElementById('questObjective');
    this.questChallenge = document.getElementById('questChallenge');
    this.questXpReward = document.getElementById('questXpReward');
    this.questStatusBadge = document.getElementById('questStatusBadge');

    // Quest Action Buttons
    this.completeQuestBtn = document.getElementById('completeQuestBtn');
    this.abandonQuestBtn = document.getElementById('abandonQuestBtn');
    this.audioBriefingBtn = document.getElementById('audioBriefingBtn');
    this.audioBriefingIcon = document.getElementById('audioBriefingIcon');
    this.audioBriefingText = document.getElementById('audioBriefingText');

    // Main CTA Button
    this.generateQuestBtn = document.getElementById('generateQuestBtn');
    this.generateBtnText = document.getElementById('generateBtnText');
  }

  /**
   * Initializes Sentry SDK if DSN is provided in localStorage or settings.
   */
  initSentry() {
    const dsn = (typeof localStorage !== 'undefined' && localStorage.getItem('sentry_dsn'))
      || this.settings.sentry_dsn;

    const setup = () => {
      if (typeof Sentry !== 'undefined' && typeof Sentry.init === 'function') {
        try {
          if (dsn && dsn.trim()) {
            Sentry.init({
              dsn: dsn.trim(),
              tracesSampleRate: 1.0
            });
            console.info('[Sentry] Initialized with user DSN.');
            this.logStatus('Sentry tracing & error monitoring initialized.');
          }
        } catch (err) {
          console.warn('[Sentry] Initialization error:', err);
        }
      }
    };

    if (typeof Sentry !== 'undefined' && typeof Sentry.onLoad === 'function') {
      Sentry.onLoad(setup);
    } else {
      setup();
    }
  }

  /**
   * Populates the WebLLM model select dropdown dynamically using webllm.prebuiltAppConfig.model_list.
   * Sets Gemma as the default option if available.
   */
  async populateWebLLMModelOptions() {
    if (!this.webllmModelSelect) return;

    try {
      const models = await getWebLLMModelList();
      const defaultGemma = getDefaultWebLLMModel(models);
      const activeModel = this.settings.webllm_model || defaultGemma;

      this.webllmModelSelect.innerHTML = '';
      models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m.includes('gemma') ? `🌟 ${m} (Gemma)` : m;
        if (m === activeModel) {
          opt.selected = true;
        }
        this.webllmModelSelect.appendChild(opt);
      });

      if (!this.settings.webllm_model) {
        this.settings.webllm_model = defaultGemma;
        this.webllmModelSelect.value = defaultGemma;
      }
    } catch (err) {
      console.warn('Failed to populate dynamic model list:', err);
    }
  }

  /**
   * Binds UI events and user interactions.
   */
  bindEvents() {
    // Settings modal triggers
    this.openSettingsBtn?.addEventListener('click', () => this.openSettings());
    this.footerSettingsBtn?.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn?.addEventListener('click', () => this.closeSettings());
    this.cancelSettingsBtn?.addEventListener('click', () => this.closeSettings());
    this.settingsBackdrop?.addEventListener('click', () => this.closeSettings());

    // Close on Escape key
    const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    win?.addEventListener?.('keydown', (e) => {
      if (e.key === 'Escape' && !this.settingsModal?.classList.contains('hidden')) {
        this.closeSettings();
      }
    });

    // Provider radio selection switch
    this.providerRadios?.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.toggleProviderConfigSections(e.target.value);
      });
    });

    // Save settings form
    this.settingsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSaveSettings();
    });

    // Geolocation action
    this.refreshGpsBtn?.addEventListener('click', () => this.acquireLocation(true));

    // Quest Generation & Actions
    this.generateQuestBtn?.addEventListener('click', () => this.handleGenerateQuestAction());
    this.completeQuestBtn?.addEventListener('click', () => this.handleCompleteQuest());
    this.abandonQuestBtn?.addEventListener('click', () => this.handleGenerateQuestAction());
    this.audioBriefingBtn?.addEventListener('click', () => this.handleAudioBriefing());
  }

  /**
   * Loads user settings from localStorage with default fallbacks.
   * 
   * @returns {Object} Settings object
   */
  loadSettings() {
    try {
      const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
      const parsed = stored ? JSON.parse(stored) : {};

      const providerMode = localStorage.getItem('provider_mode') || parsed.provider_mode || DEFAULT_SETTINGS.provider_mode;
      const customEndpoint = localStorage.getItem('custom_endpoint') || parsed.custom_endpoint || parsed.ollama_endpoint || DEFAULT_SETTINGS.ollama_endpoint;
      const apiKey = localStorage.getItem('api_key') || parsed.api_key || parsed.cloud_api_key || DEFAULT_SETTINGS.cloud_api_key;
      const elevenlabsKey = localStorage.getItem('elevenlabs_api_key') || parsed.elevenlabs_api_key || DEFAULT_SETTINGS.elevenlabs_api_key;
      const sentryDsn = localStorage.getItem('sentry_dsn') || parsed.sentry_dsn || DEFAULT_SETTINGS.sentry_dsn;

      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        provider_mode: providerMode,
        ollama_endpoint: customEndpoint,
        cloud_api_key: apiKey,
        elevenlabs_api_key: elevenlabsKey,
        sentry_dsn: sentryDsn
      };
    } catch (err) {
      console.warn('Failed to parse settings from localStorage, using defaults:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Persists settings to localStorage.
   * 
   * @param {Object} updatedSettings
   */
  saveSettings(updatedSettings) {
    this.settings = { ...this.settings, ...updatedSettings };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        localStorage.setItem('provider_mode', this.settings.provider_mode);
        
        if (this.settings.provider_mode === 'ollama') {
          localStorage.setItem('custom_endpoint', this.settings.ollama_endpoint);
        } else if (this.settings.provider_mode === 'cloud') {
          localStorage.setItem('custom_endpoint', this.settings.cloud_endpoint);
          localStorage.setItem('api_key', this.settings.cloud_api_key);
        }

        if (this.settings.elevenlabs_api_key) {
          localStorage.setItem('elevenlabs_api_key', this.settings.elevenlabs_api_key);
        }
        if (this.settings.sentry_dsn) {
          localStorage.setItem('sentry_dsn', this.settings.sentry_dsn);
          this.initSentry();
        }
      }
      return true;
    } catch (err) {
      console.error('Failed to save settings to localStorage:', err);
      return false;
    }
  }

  /**
   * Loads player stats from localStorage.
   * 
   * @returns {Object} Player state
   */
  loadPlayerStats() {
    try {
      const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(PLAYER_STORAGE_KEY) : null;
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (_e) {
      // ignore fallback
    }
    return { level: 1, xp: 0, completedQuests: 0 };
  }

  /**
   * Persists player stats to localStorage.
   */
  savePlayerStats() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(this.playerState));
      }
    } catch (_e) {
      // ignore
    }
    this.updatePlayerStatsUI();
  }

  /**
   * Updates player stats bar in the UI.
   */
  updatePlayerStatsUI() {
    if (this.playerLevel) this.playerLevel.textContent = this.playerState.level;
    if (this.playerXP) this.playerXP.textContent = this.playerState.xp;
    if (this.playerQuestsCount) this.playerQuestsCount.textContent = this.playerState.completedQuests;
  }

  /**
   * Updates UI components to reflect currently saved settings.
   */
  applySettingsToUI() {
    const mode = this.settings.provider_mode;

    const activeRadio = document.querySelector(`input[name="provider_mode"][value="${mode}"]`);
    if (activeRadio) {
      activeRadio.checked = true;
    }

    if (this.webllmModelSelect && this.settings.webllm_model) {
      this.webllmModelSelect.value = this.settings.webllm_model;
    }
    if (this.ollamaEndpointInput) this.ollamaEndpointInput.value = this.settings.ollama_endpoint || DEFAULT_SETTINGS.ollama_endpoint;
    if (this.ollamaModelInput) this.ollamaModelInput.value = this.settings.ollama_model || DEFAULT_SETTINGS.ollama_model;
    if (this.cloudEndpointInput) this.cloudEndpointInput.value = this.settings.cloud_endpoint || DEFAULT_SETTINGS.cloud_endpoint;
    if (this.cloudApiKeyInput) this.cloudApiKeyInput.value = this.settings.cloud_api_key || '';
    if (this.cloudModelInput) this.cloudModelInput.value = this.settings.cloud_model || DEFAULT_SETTINGS.cloud_model;
    if (this.elevenlabsApiKeyInput) this.elevenlabsApiKeyInput.value = this.settings.elevenlabs_api_key || '';
    if (this.sentryDsnInput) this.sentryDsnInput.value = this.settings.sentry_dsn || '';

    this.toggleProviderConfigSections(mode);

    const badgeLabelMap = {
      webllm: 'WebLLM (WebGPU)',
      ollama: 'Local Ollama',
      cloud: 'Cloud API'
    };
    if (this.providerBadgeText) {
      this.providerBadgeText.textContent = badgeLabelMap[mode] || mode;
    }

    this.logStatus(`Active provider: ${badgeLabelMap[mode] || mode}`);
  }

  /**
   * Toggles configuration fields based on selected provider mode.
   * 
   * @param {string} mode - 'webllm' | 'ollama' | 'cloud'
   */
  toggleProviderConfigSections(mode) {
    if (this.sectionWebllm) this.sectionWebllm.classList.toggle('hidden', mode !== 'webllm');
    if (this.sectionOllama) this.sectionOllama.classList.toggle('hidden', mode !== 'ollama');
    if (this.sectionCloud) this.sectionCloud.classList.toggle('hidden', mode !== 'cloud');
  }

  /**
   * Checks if WebGPU is available in the current browser.
   */
  checkWebGPUSupport() {
    const supported = isWebGPUSupported();
    if (this.webgpuIndicator && this.webgpuStatusText) {
      if (supported) {
        this.webgpuIndicator.className = 'w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50';
        this.webgpuStatusText.textContent = 'WebGPU supported by your browser.';
        this.webgpuStatusText.className = 'text-emerald-400 font-medium';
      } else {
        this.webgpuIndicator.className = 'w-2 h-2 rounded-full bg-amber-500';
        this.webgpuStatusText.textContent = 'WebGPU not detected. Ollama or Cloud API recommended.';
        this.webgpuStatusText.className = 'text-amber-400 font-medium';
      }
    }
  }

  /**
   * Displays the Settings modal.
   */
  openSettings() {
    this.applySettingsToUI();
    this.populateWebLLMModelOptions();
    if (this.settingsFeedback) this.settingsFeedback.classList.add('hidden');
    this.settingsModal?.classList.remove('hidden');
    document.body?.classList.add('overflow-hidden');
  }

  /**
   * Hides the Settings modal.
   */
  closeSettings() {
    this.settingsModal?.classList.add('hidden');
    document.body?.classList.remove('overflow-hidden');
  }

  /**
   * Handles saving settings from the modal form.
   */
  handleSaveSettings() {
    const selectedMode = document.querySelector('input[name="provider_mode"]:checked')?.value || 'webllm';
    
    const newSettings = {
      provider_mode: selectedMode,
      webllm_model: this.webllmModelSelect?.value || DEFAULT_SETTINGS.webllm_model,
      ollama_endpoint: this.ollamaEndpointInput?.value.trim() || DEFAULT_SETTINGS.ollama_endpoint,
      ollama_model: this.ollamaModelInput?.value.trim() || DEFAULT_SETTINGS.ollama_model,
      cloud_endpoint: this.cloudEndpointInput?.value.trim() || DEFAULT_SETTINGS.cloud_endpoint,
      cloud_api_key: this.cloudApiKeyInput?.value.trim() || '',
      cloud_model: this.cloudModelInput?.value.trim() || DEFAULT_SETTINGS.cloud_model,
      elevenlabs_api_key: this.elevenlabsApiKeyInput?.value.trim() || '',
      sentry_dsn: this.sentryDsnInput?.value.trim() || ''
    };

    const saved = this.saveSettings(newSettings);
    if (saved) {
      this.applySettingsToUI();
      if (this.settingsFeedback) {
        this.settingsFeedback.textContent = 'Settings saved to localStorage!';
        this.settingsFeedback.classList.remove('hidden');
      }
      this.showToast('Preferences successfully updated.', 'info');
      setTimeout(() => {
        this.closeSettings();
      }, 700);
    }
  }

  /**
   * Outputs message to the status console.
   * 
   * @param {string} msg 
   */
  logStatus(msg) {
    if (this.statusMessage) {
      this.statusMessage.textContent = msg;
    }
  }

  /**
   * Displays an animated mobile toast notification.
   * 
   * @param {string} message
   * @param {'info' | 'warning' | 'error'} [type='info']
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
      console.info(`[Toast: ${type}] ${message}`);
      return;
    }

    const toast = document.createElement('div');
    const bgStyles = type === 'error'
      ? 'bg-rose-950/95 border-rose-700/80 text-rose-200'
      : type === 'warning'
      ? 'bg-amber-950/95 border-amber-700/80 text-amber-200'
      : 'bg-slate-900/95 border-forest-600/60 text-slate-100';

    toast.className = `p-3 rounded-xl border shadow-xl text-xs font-medium backdrop-blur-md transition-all duration-300 pointer-events-auto transform translate-y-0 opacity-100 flex items-center justify-between gap-2.5 ${bgStyles}`;
    
    const icon = type === 'error' ? '⚠️' : type === 'warning' ? '🔔' : '🌿';
    toast.innerHTML = `
      <span class="text-sm shrink-0">${icon}</span>
      <span class="flex-1 leading-snug">${message}</span>
      <button type="button" class="text-sm font-bold opacity-60 hover:opacity-100 shrink-0 px-1">&times;</button>
    `;

    toast.querySelector('button')?.addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ==============================================================
  // Phase 2: Geolocation & Environment Context Engine
  // ==============================================================

  /**
   * Updates location UI indicators while scanning.
   * 
   * @param {'idle' | 'scanning' | 'success' | 'error'} state
   */
  updateLocationStatusUI(state) {
    if (this.refreshGpsBtn) {
      this.refreshGpsBtn.disabled = state === 'scanning';
      this.refreshGpsBtn.textContent = state === 'scanning' ? 'Scanning...' : (this.locationContext ? 'Refresh GPS' : 'Scan GPS');
    }

    if (this.gpsSignalDot) {
      if (state === 'scanning') {
        this.gpsSignalDot.className = 'inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping';
      } else if (state === 'success') {
        this.gpsSignalDot.className = 'inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50';
      } else if (state === 'error') {
        this.gpsSignalDot.className = 'inline-block w-2 h-2 rounded-full bg-rose-500';
      } else {
        this.gpsSignalDot.className = 'inline-block w-2 h-2 rounded-full bg-slate-500';
      }
    }
  }

  /**
   * Updates UI components upon successful GPS acquisition and reverse geocoding.
   * 
   * @param {Object} ctx
   */
  updateLocationSuccessUI(ctx) {
    if (this.biomeDescription) {
      this.biomeDescription.textContent = ctx.readableDescription;
      this.biomeDescription.className = 'text-sm font-semibold text-emerald-300 mt-0.5 capitalize';
    }
    if (this.gpsCoordsText) {
      this.gpsCoordsText.textContent = `Lat: ${ctx.latitude.toFixed(5)}°, Lon: ${ctx.longitude.toFixed(5)}° (±${ctx.accuracy}m)`;
      this.gpsCoordsText.className = 'mt-2 text-[11px] font-mono text-slate-400';
    }
    this.updateLocationStatusUI('success');
  }

  /**
   * Updates UI components when GPS acquisition encounters an error.
   * 
   * @param {string} errorMsg
   */
  updateLocationErrorUI(errorMsg) {
    if (this.biomeDescription) {
      this.biomeDescription.textContent = 'GPS Scan Incomplete';
      this.biomeDescription.className = 'text-sm font-semibold text-rose-300 mt-0.5';
    }
    if (this.gpsCoordsText) {
      this.gpsCoordsText.textContent = errorMsg;
      this.gpsCoordsText.className = 'mt-2 text-[11px] font-mono text-rose-400';
    }
    this.updateLocationStatusUI('error');
  }

  /**
   * Acquires GPS coordinates via HTML5 Geolocation API and reverse-geocodes
   * them via OpenStreetMap Nominatim into a readable environment description.
   * 
   * @param {boolean} [forceRefresh=false]
   * @returns {Promise<Object>} The acquired location context
   */
  async acquireLocation(forceRefresh = false) {
    if (this.isAcquiringLocation) return this.locationContext;
    if (this.locationContext && !forceRefresh) return this.locationContext;

    this.isAcquiringLocation = true;
    this.updateLocationStatusUI('scanning');

    try {
      this.logStatus('Acquiring coordinates via HTML5 Geolocation...');
      const position = await getBrowserCoordinates();
      const { latitude, longitude, accuracy } = position.coords;

      this.logStatus(`Coordinates locked (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°). Querying OpenStreetMap Nominatim...`);
      
      let nominatimData = null;
      try {
        nominatimData = await reverseGeocodeNominatim(latitude, longitude);
      } catch (geoFetchErr) {
        console.warn('Reverse geocoding fetch warning, using coordinate fallback:', geoFetchErr);
      }

      const translation = translateEnvironment(nominatimData, latitude, longitude);

      this.locationContext = {
        latitude,
        longitude,
        accuracy: Math.round(accuracy || 0),
        environment: translation.environment,
        readableDescription: translation.readableDescription,
        poiName: translation.poiName,
        locality: translation.locality,
        fullAddress: translation.fullAddress,
        timestamp: Date.now()
      };

      this.updateLocationSuccessUI(this.locationContext);
      this.logStatus(`Location context active: ${this.locationContext.readableDescription}`);
      return this.locationContext;

    } catch (err) {
      console.error('Location acquisition error:', err);
      let errorMsg = 'Could not acquire GPS position.';
      if (err.code === 1) {
        errorMsg = 'Location permission denied by user/browser.';
      } else if (err.code === 2) {
        errorMsg = 'GPS location unavailable. Please check device signal.';
      } else if (err.code === 3) {
        errorMsg = 'GPS location request timed out. Please retry.';
      } else if (err.message) {
        errorMsg = err.message;
      }

      this.updateLocationErrorUI(errorMsg);
      this.logStatus(`Location error: ${errorMsg}`);
      if (typeof Sentry !== 'undefined' && typeof Sentry.captureException === 'function') {
        Sentry.captureException(err);
      }
      throw err;
    } finally {
      this.isAcquiringLocation = false;
    }
  }

  // ==============================================================
  // Phase 3 & 4: Quest Generation Execution with Sentry Spans
  // ==============================================================

  /**
   * Generates a new micro-quest based on user's real location and active provider.
   * Wraps call inside Sentry.startSpan() for performance latency tracing if Sentry is active.
   */
  async handleGenerateQuestAction() {
    if (this.isGeneratingQuest) return;

    this.isGeneratingQuest = true;
    if (this.generateQuestBtn) {
      this.generateQuestBtn.disabled = true;
      this.generateQuestBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }
    if (this.generateBtnText) {
      this.generateBtnText.textContent = 'Generating Quest...';
    }

    try {
      // 1. Ensure location context is acquired cleanly
      if (!this.locationContext) {
        this.logStatus('Acquiring real location before generating quest...');
        await this.acquireLocation();
      }

      const mode = this.settings.provider_mode || 'webllm';
      this.logStatus(`Querying active provider [${mode.toUpperCase()}] for outdoor micro-quest...`);

      const onProgress = (msg) => {
        this.logStatus(msg);
      };

      // 2. Wrap quest generation in Sentry.startSpan if available
      let quest;
      if (typeof Sentry !== 'undefined' && typeof Sentry.startSpan === 'function') {
        quest = await Sentry.startSpan(
          {
            name: 'Generate Quest',
            op: 'ai.generation',
            attributes: {
              'ai.provider': mode,
              'ai.model': mode === 'webllm' ? this.settings.webllm_model : mode === 'ollama' ? this.settings.ollama_model : this.settings.cloud_model,
              'location.environment': this.locationContext?.environment || 'unknown'
            }
          },
          async (_span) => {
            return await this.aiRouter.generateQuest(
              this.locationContext,
              this.settings,
              onProgress
            );
          }
        );
      } else {
        quest = await this.aiRouter.generateQuest(
          this.locationContext,
          this.settings,
          onProgress
        );
      }

      // 3. Render validated quest card to UI
      this.renderQuest(quest);
      this.logStatus(`Quest received from [${mode.toUpperCase()}]: "${quest.quest_title}"!`);

    } catch (err) {
      console.error('Quest generation failed:', err);
      this.logStatus(`Quest Generation Error: ${err.message}`);
      this.showToast(`Quest Generation Error: ${err.message}`, 'error');
      if (typeof Sentry !== 'undefined' && typeof Sentry.captureException === 'function') {
        Sentry.captureException(err);
      }
    } finally {
      this.isGeneratingQuest = false;
      if (this.generateQuestBtn) {
        this.generateQuestBtn.disabled = false;
        this.generateQuestBtn.classList.remove('opacity-75', 'cursor-not-allowed');
      }
      if (this.generateBtnText) {
        this.generateBtnText.textContent = 'Generate Quest';
      }
    }
  }

  /**
   * Quest Card UI Renderer.
   * Adheres strictly to the quest-master schema:
   * { quest_title, objective, outdoor_challenge, xp_reward }
   * 
   * @param {Object} questData 
   */
  renderQuest(questData) {
    if (!questData) return;

    this.activeQuest = questData;

    if (this.questTitle) this.questTitle.textContent = questData.quest_title;
    if (this.questObjective) this.questObjective.textContent = questData.objective;
    if (this.questChallenge) this.questChallenge.textContent = questData.outdoor_challenge;
    if (this.questXpReward) this.questXpReward.textContent = questData.xp_reward;

    if (this.emptyQuestCard) this.emptyQuestCard.classList.add('hidden');
    if (this.activeQuestCard) this.activeQuestCard.classList.remove('hidden');

    if (this.questStatusBadge) {
      this.questStatusBadge.textContent = 'Active Quest';
      this.questStatusBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest-950 text-forest-300 border border-forest-800';
    }

    if (this.completeQuestBtn) {
      this.completeQuestBtn.disabled = false;
      this.completeQuestBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        Complete & Claim XP
      `;
      this.completeQuestBtn.className = 'flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-forest-600 hover:bg-forest-500 active:scale-[0.98] text-white shadow-lg shadow-forest-950 transition flex items-center justify-center gap-2';
    }

    if (this.audioBriefingBtn) {
      this.audioBriefingBtn.disabled = false;
    }
  }

  /**
   * Handles completing the active quest and claiming XP reward.
   */
  handleCompleteQuest() {
    if (!this.activeQuest) return;

    const reward = this.activeQuest.xp_reward || 150;
    this.playerState.xp += reward;
    this.playerState.completedQuests += 1;

    // Level formula: Level = floor(XP / 500) + 1
    this.playerState.level = Math.floor(this.playerState.xp / 500) + 1;

    this.savePlayerStats();

    if (this.questStatusBadge) {
      this.questStatusBadge.textContent = 'Completed ⭐';
      this.questStatusBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800';
    }

    if (this.completeQuestBtn) {
      this.completeQuestBtn.disabled = true;
      this.completeQuestBtn.textContent = 'Quest Completed!';
      this.completeQuestBtn.className = 'flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed flex items-center justify-center gap-2';
    }

    this.showToast(`+${reward} XP Earned! Great job touching grass.`, 'info');
    this.logStatus(`Victory! Claimed ${reward} XP for touching grass. Total XP: ${this.playerState.xp} (Level ${this.playerState.level}).`);
  }

  // ==============================================================
  // Phase 4: ElevenLabs TTS Audio Briefings
  // ==============================================================

  /**
   * Triggers voice briefing generation using ElevenLabs TTS API.
   * Stops any currently playing audio, enforces API key check, and shows user-friendly toast.
   */
  async handleAudioBriefing() {
    if (!this.activeQuest) {
      this.showToast('Generate a quest first to hear its audio briefing!', 'warning');
      return;
    }

    const apiKey = (typeof localStorage !== 'undefined' && localStorage.getItem('elevenlabs_api_key'))
      || this.settings.elevenlabs_api_key;

    if (!apiKey || !apiKey.trim()) {
      this.showToast('Please set your ElevenLabs API Key in Settings to hear voice briefings.', 'warning');
      this.openSettings();
      return;
    }

    // Stop any active audio playback before playing a new briefing
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_e) {
        // ignore
      }
      this.currentAudio = null;
    }

    const briefingText = `Quest briefing for ${this.activeQuest.quest_title}. Objective: ${this.activeQuest.objective}. Outdoor challenge: ${this.activeQuest.outdoor_challenge}. Head outside, touch grass, and claim your ${this.activeQuest.xp_reward} experience points!`;

    const btn = this.audioBriefingBtn;
    const icon = this.audioBriefingIcon;
    const text = this.audioBriefingText;

    if (btn) btn.disabled = true;
    if (icon) icon.textContent = '⏳';
    if (text) text.textContent = 'Synthesizing Audio...';
    this.logStatus('Calling ElevenLabs TTS API for voice briefing...');

    try {
      const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
      const targetUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey.trim()
        },
        body: JSON.stringify({
          text: briefingText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) {
        let errDetail = '';
        try {
          const errJson = await response.json();
          errDetail = errJson.detail?.message || JSON.stringify(errJson);
        } catch {
          errDetail = await response.text().catch(() => response.statusText);
        }
        throw new Error(`ElevenLabs returned HTTP ${response.status}: ${errDetail}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      this.currentAudio = new Audio(audioUrl);

      if (icon) icon.textContent = '🔊';
      if (text) text.textContent = 'Playing Audio Briefing...';
      this.logStatus('Playing audio briefing from ElevenLabs.');

      this.currentAudio.onended = () => {
        this.currentAudio = null;
        if (icon) icon.textContent = '🔊';
        if (text) text.textContent = 'Audio Briefing (ElevenLabs)';
        if (btn) btn.disabled = false;
        this.logStatus('Audio briefing finished.');
      };

      this.currentAudio.onerror = (e) => {
        console.error('Audio playback error:', e);
        this.currentAudio = null;
        if (icon) icon.textContent = '🔊';
        if (text) text.textContent = 'Audio Briefing (ElevenLabs)';
        if (btn) btn.disabled = false;
        this.showToast('Audio playback failed in browser.', 'error');
      };

      await this.currentAudio.play();
      if (btn) btn.disabled = false;

    } catch (err) {
      console.error('ElevenLabs TTS failed:', err);
      this.showToast(`ElevenLabs Error: ${err.message}`, 'error');
      this.logStatus(`Audio Briefing Error: ${err.message}`);
      if (typeof Sentry !== 'undefined' && typeof Sentry.captureException === 'function') {
        Sentry.captureException(err);
      }
    } finally {
      if (!this.currentAudio) {
        if (btn) btn.disabled = false;
        if (icon) icon.textContent = '🔊';
        if (text) text.textContent = 'Audio Briefing (ElevenLabs)';
      }
    }
  }
}

// Initialize on DOM load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.grassToucherApp = new GrassToucherApp();
  });
}
