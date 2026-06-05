# Cahier Journal 2026 — Instructions Claude

## Projet
- **Site public** : https://benistad.github.io/cahier-journal-2026/
- **Données** : `data.json` (source de vérité, je mets à jour ce fichier)
- **Documents** : dossier `docs/`
- **Publication** : `bash publish.sh` après chaque modification

---

## Workflow de mise à jour
1. Modifier `data.json` et/ou copier des fichiers dans `docs/`
2. `bash publish.sh` → commit automatique + push → site mis à jour en ~1 min

---

## Structure data.json

```json
{
  "YYYY-MM-DD": {
    "Lundi":    { "blocks": [...], "attachments": [...] },
    "Mardi":    { "blocks": [...], "attachments": [...] },
    "Mercredi": { "blocks": [...], "attachments": [...] },
    "Jeudi":    { "blocks": [...], "attachments": [...] },
    "Vendredi": { "blocks": [...], "attachments": [...] }
  }
}
```

La clé de semaine est le **lundi** au format `YYYY-MM-DD`.

### Types de blocs

```json
{ "type": "subject", "tag": "NomMatière", "content": "..." }
{ "type": "break",   "label": "RECREATION" }
{ "type": "break",   "label": "PAUSE MERIDIENNE" }
{ "type": "break",   "label": "FIN DE JOURNÉE" }
```

---

## Mise en forme du contenu (`content`)

### Syntaxe des lignes

| Préfixe | Rendu | Usage |
|---------|-------|-------|
| *(aucun, ligne se terminant par `:`)* | **Titre gras** | Introduire une série d'exercices |
| `- ` ou `– ` | Item à puce | Activité, exercice, consigne |
| `>>` | Bloc détail grisé (bordure gauche) | Liste de mots, contenu verbatim d'exercice |
| `[texte](url)` seul sur une ligne | Chips de documents cliquables | Liens vers fichiers joints |

### Exemples

```
Exercices d'application sur le passé simple :
- Ex. 1 : Recopie les verbes au passé simple
>> il mangea – elles jouèrent – ils passèrent – vous menâtes
- Ex. 2 : Complète avec la terminaison qui convient
>> il remplaç… · tu diminu… · nous march…
```

```
- Séance 2 : Collaborer, résister, subir
- [Diaporama](docs/fichier.pptx) · [Fiche élèves](docs/fiche.docx)
```

```
- Exercice n°2 p.30
- Exercice n°8 p.31
- Correction collective
```

---

## Règles importantes

- **Documents** : toujours liés **dans le bloc de la matière concernée** (pas dans `attachments` du jour), via `[nom](docs/fichier)` sur sa propre ligne
- **Pauses** : utiliser `RECREATION`, `PAUSE MERIDIENNE`, `FIN DE JOURNÉE` (jamais "CANTINE")
- **Fichiers** : copier dans `docs/` avant de référencer dans `data.json`
- **`attachments`** du jour : uniquement pour les documents généraux non liés à une seule activité (ex. leçon référencée dans plusieurs blocs)

---

## Matières courantes (tags)
Rituels, APQ, Dictée, EDL, Calcul Mental, Calcul, Numération, Sciences, Anglais, Histoire, Géographie, Lecture, Rédaction, Conjugaison, Arts visuels, EPS, Musique, EMC
