# GrassToucher: The Real-World RPG

Turn real-world walks into an open-world adventure. GrassToucher leverages device geolocation and in-browser AI to generate custom, context-aware RPG quests based on physical surroundings.

## What is GrassToucher

GrassToucher uses device GPS and OpenStreetMap data to turn local parks, streets, and landmarks into interactive quest zones. Powered by client-side local AI models, it generates unique narrative challenges, lore, and rewards tailored to precise coordinates while keeping location data private on-device.

## Architecture and Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| Frontend and UI | HTML5, CSS3, Modern JS | Mobile-first responsive web client |
| Local AI Engine | Google Gemma via WebLLM | Privacy-first quest generation directly in-browser |
| Geospatial Data | Geolocation API + Nominatim | Coordinate mapping and reverse geocoding |
| Voice Narration | ElevenLabs API | Text-to-speech atmospheric audio briefings |
| Observability | Sentry SDK | Performance tracing, latency tracking, and error logging |
| Hosting | Render | Static site hosting configured via render.yaml |
| Agent Workflow | Entire | Audit trail of agent sessions in docs/agent-sessions.md |

## Partner Category Integrations

- Google Gemma / WebLLM: Prebuilt WebLLM model dropdown defaulting to Gemma weights running locally via WebGPU.
- ElevenLabs: Real-time speech synthesis delivering quest briefings to players on the go.
- Sentry Agent Tracing: Performance spans (Sentry.startSpan()) benchmarking model response time, geocoding speed, and audio generation latency.
- Render: Static web hosting deployment via render.yaml.
- Entire: Transparent agent development history documented in docs/agent-sessions.md.

## Quick Start and Installation

Running GrassToucher locally requires no heavy backend dependencies:

1. Clone the Repository:
   ```bash
   git clone [https://github.com/Moeen-19/grasstoucher.git](https://github.com/Moeen-19/grasstoucher.git)
   cd grasstoucher
   ```
   
2. Serve the Frontend:
    
    Run a static HTTP server on your PC or laptop:
    ```bash
    npx serve frontend -p 3000
    ```
    Alternative: You can deploy the frontend/ directory directly to any cloud static file host such as Render, Vercel, Netlify, or GitHub Pages.
    
3. Configure Settings:

- Open http://localhost:3000 in a WebGPU-enabled browser.
- Access the Settings modal.
- Enter optional ElevenLabs API Key and Sentry DSN to enable voice briefings and performance tracing.

## Project Structure

GrassToucher/
|-- frontend/             # Client app (index.html, app.js, webllm-engine.js)
|-- backend/              # Optional fallback scripts
|-- docs/                 # Documentation & agent-sessions.md
|-- blueprint.md          # Architectural plan & guidelines
|-- render.yaml           # Render deployment configuration
`-- .gitignore            # Secret & artifact exclusions

## Documentation

- Architectural Blueprint: blueprint.md
- Agent Session Logs: docs/agent-sessions.md

## License

Distributed under the MIT License.
