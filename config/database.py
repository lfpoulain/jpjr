"""
Configuration de la base de données pour JPJR.
Permet de choisir entre PostgreSQL et SQLite via la variable d'environnement DB_TYPE.
"""
import os
import logging
from dotenv import load_dotenv, set_key, find_dotenv


logger = logging.getLogger(__name__)

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# Déterminer le type de base de données à utiliser
# Valeurs possibles: 'postgresql' (défaut), 'sqlite'
DB_TYPE = os.getenv('DB_TYPE', 'postgresql').lower()

# Configuration pour SQLite
# Nom du fichier de base de données SQLite, par défaut 'jpjr.db' à la racine du projet.
SQLITE_DB_NAME = os.getenv('SQLITE_DB_NAME', 'jpjr.db')

# Configuration par défaut pour PostgreSQL (utilisée si DB_TYPE est 'postgresql')
# Ces valeurs peuvent être surchargées par le fichier db_config.json ou des variables d'environnement spécifiques.
DEFAULT_PG_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'inventaire'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
    'port': os.getenv('DB_PORT', '5432')
}

# Le fichier .env est maintenant la source unique de configuration pour PostgreSQL.
# La variable POSTGRES_CONFIG_FILE n'est plus utilisée.

def get_connection_string():
    """
    Retourne la chaîne de connexion à la base de données en fonction de DB_TYPE.

    Pour SQLite:
    - Définir DB_TYPE=sqlite dans les variables d'environnement.
    - Optionnellement, définir SQLITE_DB_NAME (défaut: jpjr.db, stocké à la racine du projet).

    Pour PostgreSQL:
    - DB_TYPE peut être omis ou défini à 'postgresql'.
    - La configuration est lue depuis les variables d'environnement (DB_HOST, DB_NAME, etc.)
      et peut être surchargée par le fichier 'db_config.json'.
    """
    if DB_TYPE == 'sqlite':
        # Construire le chemin absolu vers le fichier .db pour SQLite
        # Le fichier est placé dans le dossier 'data' à la racine du projet
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_dir = os.path.join(project_root, 'data')
        os.makedirs(data_dir, exist_ok=True)
        sqlite_db_path = os.path.join(data_dir, SQLITE_DB_NAME)
        logger.info("Utilisation de la base de données SQLite: %s", sqlite_db_path)
        return f"sqlite:///{sqlite_db_path}"
    
    elif DB_TYPE == 'postgresql':
        # Utiliser la configuration par défaut pour PostgreSQL (chargée directement depuis .env via DEFAULT_PG_CONFIG)
        pg_config = DEFAULT_PG_CONFIG
        logger.info(
            "Utilisation de la base de données PostgreSQL: %s sur %s:%s",
            pg_config['database'],
            pg_config['host'],
            pg_config['port'],
        )
        return f"postgresql://{pg_config['user']}:{pg_config['password']}@{pg_config['host']}:{pg_config['port']}/{pg_config['database']}"
    else:
        raise ValueError(f"Type de base de données non supporté: '{DB_TYPE}'. Les valeurs autorisées sont 'postgresql' ou 'sqlite'.")

def save_config(host, database, user, password, port):
    """
    Enregistre la configuration de la base de données PostgreSQL dans le fichier .env.
    Met également à jour la configuration globale DEFAULT_PG_CONFIG pour la session courante.
    Cette fonction est spécifique à PostgreSQL.
    """
    config_to_update_in_env = {
        'DB_HOST': host,
        'DB_NAME': database,
        'DB_USER': user,
        'DB_PASSWORD': password,
        'DB_PORT': port
    }

    # Mettre à jour la configuration globale DEFAULT_PG_CONFIG pour la session courante
    # DEFAULT_PG_CONFIG utilise des clés sans le préfixe 'DB_'
    DEFAULT_PG_CONFIG.update({
        'host': host,
        'database': database,
        'user': user,
        'password': password,
        'port': port
    })

    # Trouver le chemin du fichier .env. S'il n'est pas trouvé, le créer à la racine.
    dotenv_path = find_dotenv(usecwd=True) # Cherche d'abord dans le CWD
    if not dotenv_path or not os.path.exists(dotenv_path):
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dotenv_path = os.path.join(project_root, '.env')
        if not os.path.exists(dotenv_path):
            try:
                open(dotenv_path, 'a').close() # Crée le fichier s'il n'existe pas
                logger.info("Fichier .env créé à %s", dotenv_path)
            except Exception as e:
                logger.error("Impossible de créer le fichier .env à %s: %s", dotenv_path, str(e))
                raise
    
    try:
        for key, value in config_to_update_in_env.items():
            set_key(dotenv_path, key, str(value)) # S'assurer que la valeur est une chaîne
        logger.info("Configuration PostgreSQL enregistrée dans %s", dotenv_path)
    except Exception as e:
        logger.error("Impossible d'enregistrer la configuration PostgreSQL dans %s: %s", dotenv_path, str(e))
        raise Exception(f"Erreur lors de l'enregistrement de la configuration PostgreSQL: {str(e)}")
    
    # Retourner la chaîne de connexion PostgreSQL basée sur les paramètres fournis et sauvegardés
    # Ceci est utile si l'appelant veut immédiatement utiliser cette nouvelle configuration.
    logger.info("Génération de la chaîne de connexion pour la configuration PostgreSQL sauvegardée.")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"

def get_postgres_config_values():
    """
    Retourne un dictionnaire des valeurs de configuration actuelles pour PostgreSQL,
    basé sur les variables d'environnement chargées dans DEFAULT_PG_CONFIG.
    """
    return DEFAULT_PG_CONFIG.copy()

# Exemple d'utilisation (peut être retiré ou commenté en production)
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    logger.info("Configuration actuelle de la base de données:")
    # Pour tester, vous pouvez définir DB_TYPE dans votre environnement
    # export DB_TYPE=sqlite
    # export DB_TYPE=postgresql
    # Ou modifier directement ici pour un test rapide:
    # DB_TYPE = 'sqlite'
    # DB_TYPE = 'postgresql'
    
    logger.info("  DB_TYPE sélectionné: %s", DB_TYPE)
    try:
        connection_string = get_connection_string()
        logger.info("  Chaîne de connexion générée: %s", connection_string)
    except ValueError as e:
        logger.error("ERREUR: %s", e)

    # Test de save_config (ne l'exécutez que si vous voulez modifier/créer db_config.json)
    # if DB_TYPE == 'postgresql':
    #     try:
    #         print("\nTest de sauvegarde de configuration PostgreSQL...")
    #         new_pg_conn_str = save_config('new_host', 'new_db', 'new_user', 'new_pass', '5433')
    #         print(f"  Nouvelle chaîne de connexion PostgreSQL après sauvegarde: {new_pg_conn_str}")
    #         print(f"  Vérification avec get_connection_string: {get_connection_string()}") # Devrait refléter les changements
    #     except Exception as e:
    #         print(f"ERREUR lors du test de save_config: {e}")
