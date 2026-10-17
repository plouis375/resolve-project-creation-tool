# Historique des versions

## v0.07 — 17 octobre 2026

- L’installeur utilise d’abord le module Workflow Integration fourni dans l’archive; le SDK local ne sert plus que de repli pour le dépôt de développement.
- Inclut `ffprobe` universel Intel/Apple Silicon, compilé sans composants GPL et sans dépendance Homebrew.
- Ajoute les mentions LGPL et publie les sources FFmpeg correspondantes avec la release.

## v0.06 — 17 octobre 2026

- Classe les alertes de contrôle par type et permet d’afficher rapidement les fichiers concernés.
- Précise qu’une analyse technique indisponible ne signifie pas que Resolve ne peut pas lire le média; les alertes ne bloquent pas la création.

## v0.05 — 17 octobre 2026

- Ignore les sous-dossiers `Proxy` créés par Blackmagic Proxy Generator lors du scan des médias.

## v0.04 — 17 octobre 2026

- Ajoute automatiquement les dossiers sources à la liste surveillée de Blackmagic Proxy Generator, sans doublons et sans retirer les dossiers existants.
- Refuse la mise à jour de la liste si le générateur est déjà ouvert.

## v0.03 — 17 octobre 2026

- Ajoute une option facultative avec guide et bouton pour ouvrir l’application Blackmagic Proxy Generator depuis l’écran final.
- Affiche les dossiers sources et rappelle que le générateur travaille par dossier surveillé, avec création des proxies près des médias.

## v0.02 — 17 octobre 2026

- Lit la marque et le modèle depuis les sidecars XML Canon.
- N’interprète plus comme séquences les sidecars XML associés aux fichiers vidéo.

## v0.01 — 17 octobre 2026

- Première version fonctionnelle du Resolve Project Creation Tool.
- Création de projet, chutiers fixes, classement Rushs par caméra et date, détection de doublons.
- Import sans déplacer les originaux et création facultative d’une timeline d’assemblage.
- Intégration Resolve Studio via Workflow Integrations.
