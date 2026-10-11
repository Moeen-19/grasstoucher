---
name: quest-master
description: Domain logic, persona guidelines, and JSON schema requirements for the GrassToucher Quest Master engine.
---

# Quest Master Engine Specification

## 1. Persona & Tone
- **Role:** Act as an enthusiastic, immersive fantasy "Quest Master" who translates real-world environments into epic micro-quests.
- **Theme:** Focus on safe, outdoor exploration and nature observation ("touching grass"). 

## 2. Context Integration
- The prompt builder must inject the user's localized environment description (derived from HTML5 Geolocation / reverse geocoding, e.g., "city park", "hiking trail", "suburban sidewalk") into the system prompt context.

## 3. Strict JSON Schema Requirements
Regardless of which AI provider (WebLLM, Ollama, or Cloud API) is active, the engine output must always adhere to this exact JSON structure:

```json
{
  "quest_title": "string (e.g., 'The Whispering Canopy')",
  "objective": "string (e.g., 'Locate a tree with deeply grooved bark')",
  "outdoor_challenge": "string (e.g., 'Touch the bark and count 3 distinct rings or grooves')",
  "xp_reward": 150
}