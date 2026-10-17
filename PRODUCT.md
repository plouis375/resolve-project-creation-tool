# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

DaVinci Resolve Studio Workflow Integration plugin, Electron host, vanilla JavaScript and CSS renderer, Resolve's bundled `WorkflowIntegration.node` API.

## Users

The primary user is a video editor working in DaVinci Resolve Studio on macOS, preparing a project and organizing its source media.

## Product Purpose

Resolve Project Creation Tool is a temporary, integrated setup assistant for creating and preparing a Resolve project. It guides the editor through project naming, source selection and classification, organization, and optional preparation actions, then closes so the editor can continue in Resolve without keeping the assistant open. Success means the editor starts editing with a useful Media Pool structure and selected media already imported.

## Positioning

The product combines Resolve project setup, guided media classification, and camera-aware rush organization in a focused creation flow. The product name is Resolve Project Creation Tool.

## Operating Context

- Runs inside DaVinci Resolve Studio on macOS as a Workflow Integration plugin, launched from `Workspace → Workflow Integrations`; the plugin opens in a separate window. The user has Resolve Studio 21.1.0 installed from Blackmagic Design's website.
- Resolve registers the integration under its Workflow Integrations submenu. V1 does not replace or add a choice inside Resolve's native New Project dialog; the user opens the setup assistant from the Workspace menu.
- Example project: “Campagne Nike 2026”.
- Source media stays at its original Finder locations. The product does not create Finder folder structures or copy source media automatically.
- Media Pool bins: Rushs, Assets, Éléments, Séquences, Musiques, Exports.

## Capabilities and Constraints

- One fixed base project setup; no user-defined project templates in V1.
- Suggest media classification by type and allow correction before import.
- Organize video rushs as brand → camera model → shooting date. Prefer shooting-date metadata, falling back to file creation date and indicating fallback values.
- Detect likely duplicates by filename, file size, and duration; offer to skip them without a full content hash.
- Optionally prepare an “[Project Name] — Assemblage” timeline with retained rushs placed end-to-end. Derive timeline format from the dominant rush format; default to 16:9 when no dominant format emerges.
- Offer an optional guided handoff to Blackmagic Proxy Generator: show selected source folders and launch the installed app. The editor must configure watch folders, format, resolution, and start the job there; the plugin does not control or monitor generation.
- Before import, flag files that appear unreadable or incomplete. The plugin does not estimate proxy storage space; the editor configures and starts proxy generation in Blackmagic Proxy Generator.
- Show media count, total size, formats, identified cameras, and import warnings during setup and on the completion screen.
- Flag files the metadata scanner cannot read so the user can review them before import. A failed metadata scan does not prove Resolve cannot decode a file.
- Create the Exports bin only; do not configure render settings or naming conventions.
- No project archive feature in V1.
- Operations do not require a routine recap confirmation. Classification remains editable before import; optional actions must be clearly visible.
- After project creation and preparation, provide a clear close action so the user can move directly to editing. V1 does not need a persistent project dashboard.
- Validate camera/date metadata and media checks with representative user-supplied footage before claiming reliable behavior.

## Brand Commitments

The user wants a clear, restrained, polished interface that feels at home in DaVinci Resolve. Preserve Resolve's dark editing-workspace context and use its terminology; reserve color for meaningful states and actions.

## Evidence on Hand

- The installed Resolve 21.1.0 developer documentation is available on this Mac at `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/`.
- A user-supplied sample of seven Canon EOS C70 MXF clips with paired XML sidecars was scanned. The plugin identified the camera model and filtered the sidecars from the sequence list; the user confirmed the Resolve workflow works after installing the corrected v0.02 package.
- Other camera brands and media formats have not been systematically validated.

## Product Principles

- Keep the workflow inside Resolve Studio, launched from its Workflow Integrations menu.
- Preserve source-media locations.
- Make automatic classification inspectable and correctable.
- Present import status and errors clearly during setup, then return control to the normal editing workspace.

## Accessibility & Inclusion

No product-specific accessibility requirements have been established yet.
