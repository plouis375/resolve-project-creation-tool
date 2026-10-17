# Resolve Project Creation Tool — v0.01

Assistant intégré à DaVinci Resolve Studio pour créer un projet, organiser ses chutiers, puis passer au montage.

## Installer

1. Ferme DaVinci Resolve.
2. Ouvre `install.command` depuis Finder.
3. Rouvre Resolve et choisis **Workspace → Workflow Integrations → Resolve Project Creation Tool**.

Le plugin est enregistré dans le dossier standard des Workflow Integration Plugins de Resolve. `install.command` conserve une ancienne version avec un suffixe `.backup-…` avant de la remplacer.

## Parcours

- Crée un projet Resolve avec le modèle fixe : Rushs, Assets, Éléments, Séquences, Musiques et Exports.
- Scanne les dossiers choisis sans copier ni déplacer les fichiers source.
- Propose un classement par type et laisse corriger le type, la marque caméra, le modèle et la date avant import.
- Classe les rushs dans `Rushs / Marque / Modèle / Date`.
- Repère les doublons probables par nom, taille et durée. Les copies suivantes sont ignorées par défaut, avec possibilité de les réinclure.
- Peut créer une timeline d’assemblage avec les rushs retenus.
- Enregistre le projet actuellement ouvert avant de créer le nouveau projet.
- Termine avec un rapport court et un bouton qui ouvre la page Edit et ferme l’assistant.

## Limites v0.01

- La génération de proxies reste désactivée. L’API installée permet d’associer un proxy existant, mais ne fournit pas d’action prise en charge pour générer les proxies.
- `ffprobe` améliore la lecture des durées, formats et métadonnées caméra. Sans `ffprobe`, macOS Spotlight fournit un repli partiel et les champs de classement restent modifiables.
- Une erreur de lecture des métadonnées produit un avertissement. Elle ne prouve pas que Resolve ne peut pas décoder le média.
- Les résultats de métadonnées caméra et date doivent encore être confirmés sur des rushs réels représentatifs.

## Sources et paquet

- Code du plugin : `plugin/`
- Paquet préparé pour Resolve : `dist/com.idolatry.resolveprojectcreationtool/`
- `build.command` recopie la version de `WorkflowIntegration.node` fournie avec Resolve Studio installé sur ce Mac.
- `uninstall.command` retire uniquement l’intégration Resolve Project Creation Tool.

## Versions

Chaque modification publiée reçoit un numéro `v0.xx`, inscrit dans le manifeste Resolve, `package.json`, un tag Git et une release GitHub.
