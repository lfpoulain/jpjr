import logging
from logging.handlers import RotatingFileHandler
import os

# Crée le dossier de logs s'il n'existe pas
if not os.path.exists('logs'):
    os.mkdir('logs')

def setup_logging(app):
    # Si un gestionnaire par défaut est présent, le supprimer pour éviter les doublons
    if app.logger.handlers:
        for handler in list(app.logger.handlers):
            app.logger.removeHandler(handler)

    # Formatter pour les logs
    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] [%(name)s.%(funcName)s] - %(message)s'
    )

    # Handler pour la console
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    # En mode production (app.debug est False), n'afficher que les WARNINGS et ERREURS dans la console.
    # En mode debug, afficher les messages DEBUG et supérieurs.
    console_handler.setLevel(logging.WARNING if not app.debug else logging.DEBUG)

    # Ajoute les handlers au logger de l'application
    # Le logger racine est configuré pour capturer les logs de toutes les bibliothèques (ex: SQLAlchemy)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)
        try:
            handler.close()
        except Exception:
            pass
    root_logger.addHandler(console_handler)

    is_reloader_child = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    enable_file_logging = (not app.debug) or is_reloader_child

    if enable_file_logging:
        # Handler pour le fichier de log général (avec rotation)
        file_handler = RotatingFileHandler(
            'logs/jpjr.log', maxBytes=1048576, backupCount=10, encoding='utf-8', delay=True
        )
        file_handler.setFormatter(formatter)
        # En mode production (app.debug est False), enregistrer les messages INFO et supérieurs dans jpjr.log.
        # En mode debug, enregistrer les messages DEBUG et supérieurs.
        file_handler.setLevel(logging.INFO if not app.debug else logging.DEBUG)

        # Handler pour le fichier d'erreurs (avec rotation)
        error_handler = RotatingFileHandler(
            'logs/error.log', maxBytes=1048576, backupCount=10, encoding='utf-8', delay=True
        )
        error_handler.setFormatter(formatter)
        error_handler.setLevel(logging.ERROR)

        root_logger.addHandler(file_handler)
        root_logger.addHandler(error_handler)

    if not app.debug:
        # En mode production, réduire la verbosité de Werkzeug
        logging.getLogger('werkzeug').setLevel(logging.WARNING)

    app.logger.info("Configuration de la journalisation terminée. Mode debug: %s", app.debug)
