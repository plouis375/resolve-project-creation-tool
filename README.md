# Resolve Project Creation Tool — v0.02

Assistant macOS intégré à **DaVinci Resolve Studio** pour créer un projet, trier les médias dans le Media Pool et préparer le montage. Il s’ouvre depuis le menu de Resolve, guide la préparation, puis se ferme quand le projet est prêt.

[Télécharger la dernière version](https://github.com/plouis375/resolve-project-creation-tool/releases/latest) · [Voir les versions et leurs changements](https://github.com/plouis375/resolve-project-creation-tool/releases)

## Prérequis

- macOS et DaVinci Resolve Studio installés.
- Une bibliothèque de projets Resolve accessible.
- Les médias source accessibles depuis ce Mac, sur disque local ou volume monté.
- `ffprobe` est recommandé pour lire les durées, les formats vidéo et les métadonnées. Sans lui, l’outil tente un repli partiel avec Spotlight.

Le plugin a été vérifié avec DaVinci Resolve Studio 21.1.0 sur macOS. Le fonctionnement peut varier avec d’autres versions de Resolve.

## Installation

1. Télécharge et décompresse l’archive de la [dernière version](https://github.com/plouis375/resolve-project-creation-tool/releases/latest).
2. Ferme DaVinci Resolve.
3. Ouvre `install.command` depuis le dossier décompressé. Le script prépare le plugin avec le module Workflow Integration fourni par l’installation locale de Resolve Studio, puis l’installe. Une copie de l’installation précédente est conservée avec le suffixe `.backup-…`.
4. Rouvre Resolve et choisis **Workspace → Workflow Integrations → Resolve Project Creation Tool**.

Après une mise à jour, redémarre Resolve avant d’ouvrir le plugin. Pour le retirer, ferme Resolve puis lance `uninstall.command`. Cette désinstallation ne supprime pas les projets ni les médias.

## Utilisation pas à pas

1. **Projet** — Saisis le nom du projet. Il sera créé dans la bibliothèque et le dossier actuellement sélectionnés dans Resolve. Le nom proposé par défaut est « Campagne Nike 2026 »; il est modifiable.
2. **Sources** — Ajoute un ou plusieurs dossiers. L’analyse parcourt leurs sous-dossiers et présente les médias reconnus, leur taille, leur durée et leur destination dans Resolve. Tu peux chercher un fichier, changer sa catégorie ou l’exclure.
3. **Organisation** — Choisis si tu veux créer une timeline d’assemblage. Le chutier Exports est toujours créé, mais aucun réglage de rendu n’est appliqué.
4. **Création** — L’outil enregistre le projet déjà ouvert s’il y en a un, crée le nouveau projet, ajoute les chutiers et importe les éléments retenus. Un rapport indique les imports réussis et ceux à vérifier.
5. **Montage** — Le bouton de fin ouvre la page Edit et ferme l’assistant.

## Organisation créée dans Resolve

Le modèle de base crée ces chutiers dans le Media Pool :

```text
Nom du projet
├── Rushs
│   └── Marque de caméra
│       └── Modèle
│           └── Date de tournage
├── Assets
├── Éléments
├── Séquences
├── Musiques
└── Exports
```

Les rushs sont classés par marque, modèle et date. Les autres types de média sont rangés directement dans leur chutier. Cette structure est créée **dans Resolve** : l’outil ne crée pas de dossiers Finder et ne déplace ni ne copie les sources.

## Classement et import des médias

- **Rushs vidéo** — MOV, MP4, M4V, MXF, AVI, MPG/MPEG, MKV, MTS/M2TS, BRAW, R3D, ARI, CRM, 3GP et WEBM.
- **Musiques et audio** — WAV, AIF/AIFF, MP3, M4A, AAC, FLAC, OGG, OPUS et WMA.
- **Éléments image** — PNG, JPG/JPEG, TIF/TIFF, BMP, WEBP, HEIC/HEIF, EXR, DPX, DNG, ARW, CR2/CR3, NEF et RAF.
- **Assets graphiques** — PSD, AI, EPS, SVG et PDF.
- **Séquences** — FCPXML, EDL, AAF, DRT, OTIO et XML autonomes.

Les fichiers cachés sont ignorés. Quand un fichier vidéo Canon possède un XML homonyme à côté de lui, ce XML est traité comme une fiche de métadonnées : sa marque et son modèle peuvent servir au classement, et il n’apparaît pas comme séquence à importer. Les XML sans vidéo associée restent considérés comme des séquences.

L’analyse utilise d’abord les métadonnées lues par `ffprobe`. Les champs de caméra non détectés restent modifiables avant la création. Pour la date, l’outil utilise les métadonnées disponibles, puis la date de création du fichier comme repli. Une date de repli est signalée.

## Doublons et vérifications

Les doublons probables sont repérés avec le **nom, la taille et la durée**. Les correspondances ultérieures sont exclues par défaut; tu peux les réinclure dans la liste. Il s’agit d’une détection rapide, pas d’une comparaison complète du contenu : des fichiers différents ayant les mêmes caractéristiques peuvent être signalés ensemble.

L’outil signale les fichiers vides, les métadonnées illisibles et les rushs dont la caméra ou la date reste à confirmer. Une erreur de lecture des métadonnées ne signifie pas nécessairement que Resolve ne peut pas lire le média. Les fichiers originaux ne sont ni modifiés ni supprimés.

## Timeline d’assemblage (facultative)

Si l’option est cochée, Resolve crée `Nom du projet — Assemblage` dans le chutier Séquences avec les rushs retenus, bout à bout. La résolution et la fréquence suivent le format vidéo le plus représenté. En l’absence de format dominant, le repli est 1920 × 1080 (16:9), avec une fréquence détectée si possible, sinon 24 i/s.

Cette option prépare une timeline de départ; elle ne crée pas de montage éditorial, ne coupe pas les plans et ne choisit pas de prises.

## Fonctions non disponibles en v0.02

- **Génération de proxies** — Le plugin ne génère ni ne lie de proxies actuellement. L’API Workflow Integration présente sur l’installation permet de lier un proxy déjà créé, mais ne propose pas de commande de génération. C’est le prochain point à étudier.
- **Archivage** — Aucun archivage de projet n’est proposé; cette fonction n’est pas prévue dans le périmètre actuel.
- **Dossiers Finder et sauvegarde des médias** — Le plugin organise les chutiers Resolve et conserve les médias à leur emplacement. Il ne crée pas une arborescence disque et ne réalise pas de copie de sauvegarde.
- **Exports** — Le chutier Exports est créé, mais les presets, noms et réglages de rendu restent à configurer dans Resolve.

## Dépannage

- **Le plugin n’apparaît pas dans Workspace** — Vérifie qu’il a été installé avec DaVinci Resolve Studio, puis redémarre Resolve.
- **Resolve refuse la connexion** — Ferme puis rouvre Resolve. Si le problème persiste, relance `install.command` depuis l’archive officielle de la version.
- **La caméra est « À identifier »** — Vérifie que `ffprobe` est disponible, puis corrige la marque et le modèle dans la liste avant de créer le projet. Les XML Canon associés sont lus automatiquement.
- **Un fichier n’est pas importé** — Consulte le rapport final et vérifie que son volume source est toujours monté et que le format est pris en charge par ta version de Resolve.

## Développement et versions

- Code source du plugin : [`plugin/`](plugin/)
- Historique des changements : [`CHANGELOG.md`](CHANGELOG.md)
- Chaque nouvelle version du plugin reçoit un numéro `v0.xx`, inscrit dans le manifeste et le paquet, puis publié comme tag et release GitHub.
- Le paquet local est préparé par `build.command`; il utilise le module `WorkflowIntegration.node` livré avec l’installation de Resolve Studio.
