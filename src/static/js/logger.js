// src/static/js/logger.js

/**
 * Wrapper pour la console JavaScript qui respecte le mode de débogage de Flask.
 * window.FLASK_DEBUG_MODE doit être défini dans le template HTML (par exemple, via base.html).
 * Si window.FLASK_DEBUG_MODE n'est pas défini, il est considéré comme false par défaut.
 */
const appLog = {
    _isDebugMode: function() {
        if (typeof window.FLASK_DEBUG_MODE !== 'undefined') {
            return window.FLASK_DEBUG_MODE === true;
        }

        const body = document && document.body;
        if (body && body.dataset && typeof body.dataset.flaskDebug === 'string') {
            return body.dataset.flaskDebug === 'true';
        }

        return false;
    },

    /**
     * Affiche un message de log si le mode débogage est activé.
     * @param {...any} args - Les arguments à logger.
     */
    log: function(...args) {
        if (this._isDebugMode()) {
            console.log(...args);
        }
    },

    /**
     * Affiche un message de débogage si le mode débogage est activé.
     * Alias pour appLog.log.
     * @param {...any} args - Les arguments à logger.
     */
    debug: function(...args) {
        if (this._isDebugMode()) {
            console.debug(...args);
        }
    },

    /**
     * Affiche un message d'information si le mode débogage est activé.
     * @param {...any} args - Les arguments à logger.
     */
    info: function(...args) {
        if (this._isDebugMode()) {
            console.info(...args);
        }
    },

    /**
     * Affiche un message d'avertissement (toujours affiché, quel que soit le mode).
     * @param {...any} args - Les arguments à logger.
     */
    warn: function(...args) {
        console.warn(...args);
    },

    /**
     * Affiche un message d'erreur (toujours affiché, quel que soit le mode).
     * @param {...any} args - Les arguments à logger.
     */
    error: function(...args) {
        console.error(...args);
    }
};

// Pour une utilisation plus facile, vous pouvez aussi l'assigner à window si nécessaire,
// mais il est généralement préférable de l'importer comme module si votre projet JS le permet.
// window.appLog = appLog;
