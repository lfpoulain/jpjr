/**
 * Module de gestion des notifications pour l'application JPJR
 * Affiche les notifications en bas à droite de l'écran
 */

class NotificationManager {
    constructor() {
        this.container = null;
        this.init();
    }
    
    init() {
        // Créer le conteneur de notifications s'il n'existe pas déjà
        if (!document.querySelector('.notification-container')) {
            this.container = document.createElement('div');
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.querySelector('.notification-container');
        }
    }
    
    /**
     * Affiche une notification
     * @param {string} message - Le message à afficher
     * @param {string} type - Le type de notification (success, warning, danger, info)
     * @param {number} duration - La durée d'affichage en millisecondes (0 pour ne pas disparaître)
     * @returns {HTMLElement} - L'élément de notification créé
     */
    show(message, type = 'info', duration = 5000) {
        if (type === 'error') {
            type = 'danger';
        }
        const notification = document.createElement('div');
        // Utiliser les classes d'alerte Bootstrap 5
        // Le type (success, warning, danger, info) correspond déjà aux classes Bootstrap
        notification.className = `alert alert-${type} alert-dismissible fade`; // Commencer sans 'show'
        notification.setAttribute('role', 'alert');

        // Définir le message. Si le message contient du HTML, il sera interprété.
        // Assurez-vous que le HTML est sûr s'il provient d'une source non fiable.
        if (typeof message === 'string' && message.includes('<') && message.includes('>')) {
            notification.innerHTML = message;
        } else {
            notification.textContent = message;
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'alert'); // Permet à Bootstrap de gérer la fermeture
        closeBtn.setAttribute('aria-label', 'Fermer');

        notification.appendChild(closeBtn); // Ajouter le bouton de fermeture après le message

        this.container.appendChild(notification);

        // Initialiser le composant Alerte de Bootstrap sur le nouvel élément
        // Cela est nécessaire pour que data-bs-dismiss="alert" fonctionne et pour la fermeture programmée.
        if (typeof bootstrap !== 'undefined' && bootstrap.Alert) {
            new bootstrap.Alert(notification);
        }

        // Afficher la notification avec un délai pour l'animation de fondu Bootstrap
        setTimeout(() => {
            notification.classList.add('show');
        }, 10); // Un court délai pour permettre le rendu initial avant l'animation

        // Cacher automatiquement la notification après la durée spécifiée
        if (duration > 0) {
            setTimeout(() => {
                this.hide(notification);
            }, duration);
        }

        return notification;
    }
    
    /**
     * Cache et supprime une notification
     * @param {HTMLElement} notification - L'élément de notification à cacher
     */
    hide(notificationElement) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Alert) {
            const alertInstance = bootstrap.Alert.getInstance(notificationElement);
            if (alertInstance) {
                alertInstance.close(); // Utilise la méthode close de Bootstrap pour l'animation et la suppression
                return;
            }
        }
        // Fallback si l'instance d'alerte Bootstrap n'est pas trouvée ou si Bootstrap JS n'est pas chargé
        if (notificationElement && notificationElement.parentNode) {
            notificationElement.classList.remove('show'); // Déclenche l'animation de fondu de Bootstrap si possible
            // Attendre la fin de l'animation de fondu (Bootstrap utilise 150ms par défaut)
            setTimeout(() => {
                if (notificationElement.parentNode) {
                    notificationElement.parentNode.removeChild(notificationElement);
                }
            }, 160); // Légèrement plus que la durée de transition de fondu de Bootstrap
        }
    }
    
    /**
     * Affiche une notification de succès
     * @param {string} message - Le message à afficher
     * @param {number} duration - La durée d'affichage en millisecondes
     * @returns {HTMLElement} - L'élément de notification créé
     */
    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    }
    
    /**
     * Affiche une notification d'avertissement
     * @param {string} message - Le message à afficher
     * @param {number} duration - La durée d'affichage en millisecondes
     * @returns {HTMLElement} - L'élément de notification créé
     */
    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }
    
    /**
     * Affiche une notification d'erreur
     * @param {string} message - Le message à afficher
     * @param {number} duration - La durée d'affichage en millisecondes
     * @returns {HTMLElement} - L'élément de notification créé
     */
    error(message, duration = 5000) {
        return this.show(message, 'danger', duration);
    }
    
    /**
     * Affiche une notification d'information
     * @param {string} message - Le message à afficher
     * @param {number} duration - La durée d'affichage en millisecondes
     * @returns {HTMLElement} - L'élément de notification créé
     */
    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }
}

// Créer une instance globale du gestionnaire de notifications
const notificationManager = new NotificationManager();
