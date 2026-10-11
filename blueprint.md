# GrassToucher: The Real-World RPG - Execution Blueprint

We are building "GrassToucher: The Real-World RPG" for the Hacktoberfest Open-Source AI Challenge. The app features a resilient, multi-provider AI architecture (In-browser WebLLM, Local Ollama, Cloud API) and a mobile-first Tailwind UI.

## Directory Structure
- /frontend
  - index.html (Mobile-first Tailwind CSS UI with Settings modal, Quest card, & Dynamic Model Dropdowns)
  - app.js (Handles UI state, Geolocation, ElevenLabs TTS, Sentry Tracing, and multi-provider routing)
  - webllm-engine.js (Integration for browser-native WebLLM / WebGPU execution using dynamic model_list)
- /backend (Optional fallback / server mode)
  - main.py (FastAPI endpoints for cloud/server-side generation if needed)

---

## Phased Execution Roadmap

### Phase 1: Static UI & Layout Scaffolding
- **Goal:** Build the structural foundation and mobile-first layout.
- **Tasks:**
  1. Create `/frontend/index.html` styled with Tailwind CSS (mobile viewport, clean card layout, bottom action bar).
  2. Implement a working **Settings Modal** UI with inputs for:
     - Active AI Mode (In-Browser WebLLM, Local Ollama, Cloud API)
     - Dynamic WebLLM Model Select Dropdown
     - ElevenLabs API Key & Sentry DSN
  3. Create shells for `/frontend/app.js` and `/frontend/webllm-engine.js`.

### Phase 2: Geolocation & Location Context Engine
- **Goal:** Capture the user's real-world environment cleanly.
- **Tasks:**
  1. Implement HTML5 `navigator.geolocation.getCurrentPosition()` inside `app.js`.
  2. Integrate client-side reverse-geocoding via OpenStreetMap Nominatim (`https://nominatim.openstreetmap.org/reverse`) to translate coordinates into readable location text (e.g., "city park", "suburban sidewalk").

### Phase 3: Multi-Provider AI Architecture & WebLLM Dynamic Engine
- **Goal:** Wire up backend-agnostic AI adapters and dynamic WebLLM model loading.
- **Tasks:**
  1. **Dynamic WebLLM Model Selector (`webllm-engine.js`):** 
     - Import `@mlc-ai/web-llm` via ESM (`https://esm.run/@mlc-ai/web-llm`).
     - Populate the WebLLM dropdown dynamically using `webllm.prebuiltAppConfig.model_list`.
     - Implement `CreateMLCEngine(selectedModel)` with progress tracking callbacks. Default to a `gemma` model if present.
  2. **Ollama / Cloud Adapters (`app.js`):** Implement HTTP fetch calls targeting local Ollama (`http://localhost:11434`) or OpenAI/Groq compatible endpoints.
  3. Enforce strict JSON output parsing matching the `quest-master` schema.

### Phase 4: Hacktoberfest Partner Integrations
- **Goal:** Integrate ElevenLabs, Sentry, and Render configuration cleanly without placeholders.
- **Tasks:**
  1. **ElevenLabs TTS Integration (`app.js`):**
     - Add an "Audio Briefing" button on generated quest cards.
     - When clicked, make a direct client-side `fetch` POST request to `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM` using the user's stored ElevenLabs API Key.
     - Convert the returned `audio/mpeg` arrayBuffer into a `Blob`, set it to an `Audio()` object, and play it. If no key exists, show a polite toast prompt to add one in Settings.
  2. **Sentry Error & Performance Tracing (`app.js`):**
     - Initialize `Sentry.init({ dsn: storedDsn })` if a DSN is provided in `localStorage`.
     - Wrap quest generation calls inside `Sentry.startTransaction()` to measure latency and log JSON parsing failures.
  3. **Render Deployment Setup (`/render.yaml`):**
     - Add a clean `render.yaml` static site blueprint pointing to the `/frontend` directory for 1-click deployment.

---

## Definition of Done
1. `index.html` loads cleanly with mobile responsiveness.
2. The WebLLM dropdown dynamically populates with supported models (e.g., Gemma, Llama) directly from `webllm.prebuiltAppConfig.model_list`.
3. Clicking "Generate Quest" resolves coordinates, queries the chosen AI provider, and renders a valid quest JSON card.
4. Clicking "Audio Briefing" speaks the quest description via ElevenLabs TTS.
5. Sentry traces quest generation time if a DSN is supplied.