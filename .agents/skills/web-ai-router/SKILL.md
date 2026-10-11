---
name: web-ai-router
description: Guidelines for implementing multi-provider AI client logic (WebLLM, Ollama, Cloud APIs) in vanilla JS.
---

# Multi-Provider Client Implementation
1. **WebLLM Integration:** Import WebLLM via CDN in `index.html` to allow instant local model loading in mobile browsers supporting WebGPU.
2. **Settings State Management:** Store user preferences (`provider_mode`, `custom_endpoint`, `api_key`) in `localStorage` so settings persist across page refreshes.
3. **Prompt Construction:** Automatically inject the reverse-geocoded location description into the system prompt before sending it to whichever active provider model is selected.