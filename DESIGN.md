# Design

## Surface

Resolve Project Creation Tool is a temporary four-step setup assistant opened from Resolve Studio's Workflow Integrations menu. It closes after setup so the editor can continue in Resolve.

## Approved visual reference

Build the flow from `.impeccable/mocks/decision/creation-tool-sources.png`. The user approved this dark, restrained Resolve-inspired direction.

## Interface rules

- Use graphite surfaces, quiet separators, readable system sans-serif text, and Resolve red for active steps and the primary action.
- Keep media classification dense but scannable. Use editable controls for category, camera brand, model, and shooting date.
- Keep errors and metadata uncertainty beside the affected step. Do not imply a failed metadata read means Resolve cannot decode the file.
- Make optional timeline setup clear. Show proxy generation as unavailable until Resolve exposes a supported generation API.
- Use four steps: Projet, Sources, Organisation, Terminé. End with a close action that opens Resolve's Edit page.
- Do not add a persistent project dashboard to V1.
