# Agent Workspace Rules

## 1. Zero Tolerance for Mock Code
- NEVER generate mock data, random string generators, or fake JSON responses for the Quest Master engine.
- Always wire actual working integrations (WebLLM via WebGPU, local Ollama endpoints, or cloud API keys depending on the user's selected mode).

## 2. Client-First Architecture & UI
- **Client-First Logic:** Prioritize client-side JavaScript execution for UI rendering, HTML5 Geolocation, and WebLLM integration so the app can run statically.
- **Responsive UI:** The Tailwind CSS layout must be strictly mobile-first, optimized for a smartphone screen while out on a trail.
- **Multi-Provider Support:** The frontend must support flexible modes (In-browser WebLLM, local Ollama server at `http://localhost:11434`, or cloud API fallback).

## 3. Code Organization & Cleanliness
- Keep backend scripts (if used for cloud/server fallbacks) clean and modular, separating endpoints from core prompt generation logic.
- Ensure all inputs and outputs use strict JSON validation matching the target quest schema.