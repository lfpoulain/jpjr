# Documentation Technique - JPJR

Ce document décrit l'architecture et le fonctionnement de l'application JPJR. Il a été condensé pour rester lisible tout en couvrant les éléments importants du backend Flask, du frontend JavaScript et des services annexes.

## 1. Installation

1. Clonez le dépôt.
2. Créez et activez un environnement virtuel. C'est une bonne pratique pour isoler les dépendances du projet.
   ```bash
   # Créez l'environnement (une seule fois)
   python -m venv venv

   # Activez-le (à chaque nouvelle session de terminal)
   # Sur Windows :
   venv\Scripts\activate
   # Sur macOS/Linux :
   source venv/bin/activate
   ```
3. Installez les dépendances Python dans l'environnement virtuel :
   ```bash
   pip install -r requirements.txt
   ```
4. Copiez le fichier `.env.example` vers `.env` puis renseignez les variables (clé OpenAI, configuration base de données...).
5. Démarrez l'application :
   ```bash
   python -m src.app
   ```

Par défaut l'application cible PostgreSQL. Pour un test rapide vous pouvez définir `DB_TYPE=sqlite` dans le `.env`.

## 2. Organisation générale

```
src/
├── app.py             # point d'entrée Flask et enregistrement des blueprints
├── models/            # classes SQLAlchemy
├── routes/            # blueprints (main, admin, API ...)
├── services/          # logique métier réutilisable (IA, etc.)
├── templates/         # vues Jinja2
└── static/            # JS, CSS et images
```

Les fichiers de configuration se trouvent sous `config/` et la documentation dans `docs/`.

## 3. Base de données et modèles

La configuration de la base est gérée par `config/database.py`. Selon `DB_TYPE`, l'application se connecte à PostgreSQL ou SQLite. Les tables sont créées automatiquement au premier lancement.

Principaux modèles :

- **User** : représente un utilisateur pouvant emprunter du matériel.
- **Item** : article répertorié, éventuellement marqué `is_temporary` s'il est ajouté pour un emprunt ponctuel.
- **Borrow** : fait le lien entre un utilisateur et un article avec dates d'emprunt et de retour.
- **Zone/Furniture/Drawer** : décrivent un emplacement physique pour stocker les articles.

## 4. Routes et blueprints

Les routes sont regroupées par thème dans différents blueprints.

### 4.1 Main
- `/` et `/dashboard` : pages d'accueil et de gestion des emprunts.
- `/login` et `/logout` : authentification basique par sélection d'utilisateur.
- `/my-borrows` : liste des emprunts en cours pour l'utilisateur connecté.
- `/chat-inventaire` : interface conversationnelle s'appuyant sur l'IA.

### 4.2 Admin (`/admin`)
- `/admin/items` : gestion des articles (ajout, modification, suppression).
- `/admin/users` : gestion des utilisateurs.
- `/admin/locations` : création et édition des emplacements.
- `/admin/db-config` : modification des paramètres `.env` via un formulaire.
- `/admin/app-config` : configuration des paramètres OpenAI (clé API et sélection des modèles).

### 4.3 API items (`/api/items`)
- `GET /api/items` : liste paginée et filtrable des articles.
- `GET /api/items/<id>` : récupération d'un article unique.
- `POST /api/items/add` : ajout manuel ou temporaire d'un article.
- `POST /api/items/batch` : insertion en masse à partir d'un CSV.

### 4.4 API emprunts (`/api/loans`)
- `GET /api/loans` : retourne tous les emprunts, avec option `active_only`.
- `POST /api/loans/create` : création d'un ou plusieurs emprunts.
- `POST /api/loans/<id>/return` : enregistrement du retour d'un article.

### 4.5 API emplacements (`/api/location`)
- `/zones`, `/furniture`, `/drawers` : endpoints CRUD pour gérer chaque niveau de localisation.

### 4.6 API IA (`/api/ai`)
- `/transcribe` : envoie un fichier audio à OpenAI (Whisper) pour obtenir la transcription.
- `/extract` : extrait une liste d'articles depuis un texte transmis.
- `/chat/inventory` : permet de poser une question sur l'inventaire.

### 4.7 Autres
- `/reports/export_items_csv` et `/reports/generate_pdf` : export CSV et PDF des inventaires et emprunts.
- `/autocomplete` : utilitaire de complétion des noms d'articles.

## 5. Service IA

Le fichier `src/services/ai_service.py` centralise les appels à l'API OpenAI. Il met en oeuvre un logger Python afin de pouvoir suivre précisément les étapes (transcription, extraction, comparaison avec la base). Les anciennes instructions `print()` ont été remplacées par `logging` pour un meilleur contrôle de la verbosité.

### 5.1 Sélection des modèles

Deux variables d'environnement pilotent les modèles :

- `OPENAI_TRANSCRIPTION_MODEL` : modèle de transcription audio (STT) utilisé par `transcribe_audio`.
- `OPENAI_COMPLETION_MODEL` : modèle utilisé pour l'extraction/analyse et le chat (endpoints `/api/ai/extract` et `/api/ai/chat/inventory`).

Ces valeurs peuvent être :

- définies dans le fichier `.env`,
- ou modifiées depuis l'interface admin `/admin/app-config`.

L'écran admin propose des choix “connus” via liste déroulante, avec une option **Autre** permettant de saisir un modèle **custom**.

Selon l'environnement d'exécution, un redémarrage de l'application peut être nécessaire après changement de modèle.

Fonctions clés :
- `transcribe_audio` : soumet le fichier audio à Whisper.
- `extract_items_from_text` : déduit une liste d'articles depuis une phrase libre.
- `extract_items_with_locations` : même principe mais en croisant le texte avec la hiérarchie des emplacements.
- `get_inventory_chat_response` : prépare un contexte texte de l'inventaire puis envoie la requête à GPT.
- `process_audio_file` : pipeline complet utilisé par l'upload audio côté frontend.

## 6. Frontend JavaScript

Les scripts sont placés sous `src/static/js`. Quelques-uns à connaître :

- `main.js` : logique du tableau de bord (sélection des articles, envoi des emprunts, retours...).
- `voice-service.js` : gère l'enregistrement audio dans le navigateur et l'envoi au backend. Affiche un aperçu des articles reconnus.
- `location-core.js` : fonctions communes pour manipuler l'arborescence des emplacements.
- `admin-locations.js` et `item-locations.js` : interfaces spécifiques pour l'administration des zones/meubles/tiroirs et l'association des articles aux emplacements.

Un gestionnaire de notifications (`NotificationManager`, fichier `static/js/notifications.js`) est utilisé pour afficher de manière uniforme messages d'erreur ou confirmations.

Le système est basé sur :

- une création dynamique d'un conteneur `.notification-container` dans le `body`,
- des notifications rendues sous forme d'alertes Bootstrap (`.alert.alert-success|warning|danger|info`).

Les messages Flask `flash()` sont centralisés dans `base.html` et affichés via ce même gestionnaire (toasts), afin d'éviter les bandeaux “inline” spécifiques à certaines pages.

## 7. Journalisation (Logging)

Pour faciliter le débogage et la surveillance, l'application utilise le module `logging` de Python avec une configuration centralisée dans `config/logging_config.py`.

Le système est configuré pour :
- **Afficher les logs dans la console** : Utile pour le développement en temps réel.
- **Écrire tous les logs (niveau DEBUG et supérieur) dans `logs/jpjr.log`** : Ce fichier contient une trace détaillée de l'activité de l'application.
- **Isoler les erreurs dans `logs/error.log`** : Ce fichier ne contient que les logs de niveau `ERROR` et supérieur, ce qui permet d'identifier rapidement les problèmes.

Les fichiers de log sont soumis à une rotation pour éviter qu'ils ne deviennent trop volumineux.

### Activer le mode débogage

Pour obtenir des logs plus détaillés et activer le rechargement automatique de Flask, vous pouvez définir la variable d'environnement `FLASK_DEBUG` dans votre fichier `.env` :

```
FLASK_DEBUG=1
```

Mettez la valeur à `0` pour passer en mode production, ce qui réduira la verbosité des logs dans la console.

## 8. Sécurité et configuration

- Les routes sensibles vérifient la présence de `session['user_id']` pour s'assurer qu'un utilisateur est connecté.
- Les clés et paramètres sensibles (OpenAI, connexion PostgreSQL...) sont lus via `config/app_config.py` et `config/database.py`.
- Les fichiers audio temporaires sont supprimés après traitement.
- Le module `logging` permet d'obtenir des traces en production ; le niveau peut être ajusté via la configuration.

## 8. Génération de rapports

`reports_routes.py` permet de générer soit un export CSV des articles, soit un PDF listant les emprunts. Ces documents sont accessibles aux utilisateurs via l'interface admin ou la page principale.

## 9. Conseils pour la contribution

- Utilisez `python -m py_compile $(git ls-files '*.py')` pour vérifier rapidement qu'il n'y a pas d'erreur de syntaxe.

---
Cette documentation vise à donner une vue d'ensemble suffisamment détaillée pour faciliter la prise en main du code sans reproduire l'intégralité de l'ancien document. Pour plus de précisions sur un module, reportez-vous directement aux fichiers source correspondants.

## 10. Variables d'environnement principales

- `DB_TYPE` : `postgresql` ou `sqlite`.
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` : paramètres PostgreSQL.
- `SQLITE_DB_NAME` : nom du fichier SQLite si `DB_TYPE=sqlite`.
- `OPENAI_API_KEY` : clé d'accès à l'API OpenAI pour la transcription et GPT.
- `OPENAI_TRANSCRIPTION_MODEL` : modèle OpenAI pour la transcription audio (STT).
- `OPENAI_COMPLETION_MODEL` : modèle OpenAI pour l'extraction/analyse et le chat.
- `SECRET_KEY` : clé secrète Flask pour la gestion de session.

Toutes ces variables peuvent être modifiées depuis l'interface `/admin/db-config` sauf la clé secrète qui doit être définie manuellement dans le `.env`.

## 11. Déroulement d'un emprunt

1. L'utilisateur se connecte via `/login` puis accède au `/dashboard`.
2. Le script `main.js` récupère la liste des articles disponibles via `GET /api/items`.
3. Après sélection et choix de la date de retour, un appel AJAX `POST /api/loans/create` est effectué.
4. Le backend valide chaque article (non déjà emprunté) puis crée un enregistrement `Borrow`.
5. Le résultat est renvoyé au format JSON et le tableau de bord se met à jour pour afficher l'emprunt.

## 12. Pipeline de reconnaissance vocale

1. Le navigateur enregistre l'audio via `voice-service.js` (format WebM ou MP4).
2. Ce fichier est envoyé à `/api/ai/transcribe` où `AIService.transcribe_audio` contacte OpenAI.
3. Le texte obtenu est passé à `extract_items_from_text` ou `extract_items_with_locations` selon le mode choisi.
4. Les articles extraits sont renvoyés au frontend pour confirmation puis ajout éventuel à la base ou à la liste d'emprunts.

## 13. Tests rapides

Le projet ne contient pas de suite de tests automatisés mais plusieurs vérifications manuelles sont possibles :

- `python -m py_compile $(git ls-files '*.py')` assure que tous les fichiers Python se compilent correctement.
- Lancer l'application avec `python -m src.app` et parcourir les principales pages permet de vérifier l'intégration.

## 14. Structure des templates

Les templates Jinja2 sont organisés de la façon suivante :

```
src/templates/
├── base.html           # layout principal
├── dashboard.html      # page d'accueil utilisateur
├── login.html          # choix de l'utilisateur
├── admin/
│   ├── items_list.html
│   ├── user_list.html
│   └── locations.html
```

Chaque template hérite de `base.html` et dispose d'un bloc `extra_js` pour injecter son script spécifique.

## 15. Structure détaillée des sources

Cette section récapitule les principaux dossiers et fichiers pour faciliter la
prise en main du projet.

### Racine et configuration
- `config/app_config.py` : lecture des variables d'environnement et options
  globales.
- `config/database.py` : choix entre PostgreSQL ou SQLite et création de
  l'instance SQLAlchemy.
- `requirements.txt` : dépendances Python nécessaires.
- `docs/` : documentation (ce fichier).

### Code Python (`src/`)
- `app.py` : point d'entrée Flask qui initialise la base et enregistre tous les
  blueprints.
- `models/` : modèles SQLAlchemy (`user.py`, `item.py`, `borrow.py`,
  `location.py`).
- `routes/` : routes et API regroupées par thème :
  - `main_routes.py` : accueil, authentification et vues utilisateur.
  - `admin_routes.py` : formulaires d'administration et actions CRUD.
  - `items_api.py` : endpoints pour gérer les articles.
  - `loans_api.py` : création et retour des emprunts.
  - `location_routes.py` : gestion des zones, meubles et tiroirs.
  - `ai_routes.py` : routes de transcription et de chat IA.
  - `reports_routes.py` : export CSV ou PDF.
  - `utils_routes.py` : routes utilitaires (autocomplete, etc.).
- `services/ai_service.py` : interaction avec l'API OpenAI et journalisation via
  `logging`.
- `templates/` : gabarits HTML décrits dans la section précédente.
- `static/js/` : scripts JavaScript utilisés côté client :
  - `main.js` : logique du tableau de bord.
  - `borrows.js` : affichage des emprunts en cours.
  - `voice-service.js` : enregistrement et envoi de l'audio.
  - `admin-locations.js`, `item-locations.js` : manipulation des emplacements.
  - `location-core.js` : fonctions partagées pour l'arborescence.
  - `notifications.js` : système de notifications.
- `static/css/` : feuilles de style.

---
Ce document constitue une référence condensée mais complète pour la maintenance du projet JPJR.
