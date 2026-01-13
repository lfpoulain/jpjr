/**
 * Service unifié de reconnaissance vocale pour l'application JPJR
 * Utilise l'API MediaRecorder pour capturer l'audio et l'API AI pour l'analyse
 */

/**
 * Classe de base pour la reconnaissance vocale
 * Contient les fonctionnalités communes à tous les types de reconnaissance vocale
 */
class BaseVoiceRecognition {
    constructor(config) {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.stream = null;
        this.timer = null;
        this.recordingTime = 0;
        this.maxRecordingTime = 30; // 30 secondes maximum
        
        // Configuration des éléments DOM
        this.voiceBtn = config.btnId ? document.getElementById(config.btnId) : null;
        const modalElement = config.modalId ? document.getElementById(config.modalId) : null;
        this.voiceModal = modalElement ? new bootstrap.Modal(modalElement) : null;
        this.startStopBtn = config.startStopBtnId ? document.getElementById(config.startStopBtnId) : null;
        this.confirmBtn = document.getElementById(config.confirmBtnId);
        this.timerDisplay = document.getElementById(config.timerDisplayId);
        this.visualizer = document.getElementById(config.visualizerId);
        this.resultsContainer = document.getElementById(config.resultsContainerId);
        this.statusText = document.getElementById(config.statusTextId);
        
        // Configuration spécifique
        this.apiEndpoint = config.apiEndpoint;
        this.modalCloseId = config.modalId;
    }
    
    init() {
        // Vérifier si l'API MediaRecorder est disponible
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            appLog.error('La reconnaissance vocale n\'est pas prise en charge par ce navigateur.');
            if (this.voiceBtn) {
                this.voiceBtn.style.display = 'none';
            }
            return false;
        }
        
        // Initialiser les écouteurs d'événements
        this.initEventListeners();
        return true;
    }
    
    initEventListeners() {
        // Bouton pour ouvrir la modal (si applicable)
        if (this.voiceBtn && this.voiceModal) {
            this.voiceBtn.addEventListener('click', () => {
                this.voiceModal.show();
            });
        }
        
        // Bouton pour démarrer/arrêter l'enregistrement
        if (this.startStopBtn) {
            this.startStopBtn.addEventListener('click', () => {
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
        }
        
        // Le bouton d'annulation a été supprimé, la fermeture se fait maintenant via la croix en haut de la modal
        
        // Bouton pour confirmer les articles
        if (this.confirmBtn) {
            this.confirmBtn.addEventListener('click', () => {
                this.handleConfirmation(); // La logique de confirmation est gérée par la classe enfant
                // this.resetRecording(); // Le reset est souvent fait dans handleConfirmation ou après
                // Cacher la modale seulement si elle existe
                if (this.voiceModal) {
                    this.voiceModal.hide();
                }
            });
        }
        
        // Fermeture de la modal (si applicable)
        if (this.modalCloseId && document.getElementById(this.modalCloseId) && this.voiceModal) {
            // Gérer la fermeture de la modal (que ce soit par la croix ou autrement)
            document.getElementById(this.modalCloseId).addEventListener('hidden.bs.modal', () => {
                appLog.log('Modal fermée, réinitialisation de l\'enregistrement');
                this.resetRecording();
            });
            
            // S'assurer que le bouton de fermeture (croix) fonctionne correctement
            const closeButton = document.querySelector(`#${this.modalCloseId} .btn-close`);
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    appLog.log('Bouton de fermeture cliqué');
                    // Arrêter l'enregistrement s'il est en cours
                    if (this.isRecording) {
                        appLog.log('Arrêt de l\'enregistrement en cours');
                        this.stopRecording(true); // true indique qu'il s'agit d'une annulation
                    }
                    // La modal sera fermée automatiquement grâce à data-bs-dismiss="modal"
                });
            }
        }
    }
    
    startRecording() {
        // Demander l'autorisation d'accéder au microphone
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.stream = stream;
                let recorderOptions = {};
                const preferredMimeTypes = [
                    'audio/webm;codecs=opus', 
                    'audio/webm', 
                    'audio/mp4',
                    'audio/ogg;codecs=opus' // oga est aussi supporté par OpenAI
                ];
                for (const mimeType of preferredMimeTypes) {
                    if (MediaRecorder.isTypeSupported(mimeType)) {
                        recorderOptions.mimeType = mimeType;
                        break;
                    }
                }
                this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
                this.actualRecordingMimeType = this.mediaRecorder.mimeType; // Stocker le mimeType réel utilisé
                appLog.log('MediaRecorder initialized. Requested MimeType:', recorderOptions.mimeType, 'Actual MimeType:', this.actualRecordingMimeType);
                // Ce log est maintenant intégré ci-dessus avec plus de détails
                this.audioChunks = [];
                
                // Collecter les données audio
                this.mediaRecorder.addEventListener('dataavailable', event => {
                    this.audioChunks.push(event.data);
                    appLog.log('Audio chunk event.data.type:', event.data.type);
                });
                
                // Lorsque l'enregistrement est terminé
                this.mediaRecorder.addEventListener('stop', () => {
                    this.processAudio();
                });
                
                // Démarrer l'enregistrement
                this.mediaRecorder.start();
                this.isRecording = true;
                
                // Mettre à jour l'interface
                this.updateUI('recording');
                
                // Démarrer le minuteur
                this.startTimer();
                
                // Animer le visualiseur
                this.visualizer.classList.add('recording');
                this.visualizer.classList.add('realtime');
                
                // Configurer l'analyseur audio pour la visualisation
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const analyser = audioContext.createAnalyser();
                const microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);
                analyser.fftSize = 128;
                analyser.smoothingTimeConstant = 0.8;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                const bars = this.visualizer ? this.visualizer.querySelectorAll('.voice-bar') : [];
                const minBarHeight = 6;
                const maxBarHeight = 54;
                const focusBins = Math.max(4, Math.floor(bufferLength * 0.35));
                
                // Fonction pour dessiner les barres (visualisation fréquence)
                const drawWaveform = () => {
                    if (!this.isRecording) return;
                    
                    requestAnimationFrame(drawWaveform);
                    analyser.getByteFrequencyData(dataArray);
                    
                    if (!bars || bars.length === 0) {
                        return;
                    }
                    
                    let peak = 0;
                    for (let i = 0; i < focusBins; i++) {
                        const v = dataArray[i] || 0;
                        if (v > peak) peak = v;
                    }
                    const global = (peak / 255);
                    const range = (maxBarHeight - minBarHeight);
                    const t = performance.now();
                    for (let i = 0; i < bars.length; i++) {
                        const ratio = bars.length === 1 ? 0 : (i / (bars.length - 1));
                        const idx = Math.floor(ratio * (focusBins - 1));
                        const v = dataArray[idx] || 0;
                        const normalized = v / 255;
                        const wobble = 0.85 + 0.15 * Math.sin((t / 140) + (i * 0.9));
                        const mixed = ((global * 0.65) + (normalized * 0.35)) * wobble;
                        const h = Math.round(minBarHeight + Math.min(1, mixed) * range);
                        bars[i].style.height = `${h}px`;
                    }
                };
                
                // Démarrer la visualisation
                drawWaveform();
                
            })
            .catch(error => {
                appLog.error('Erreur lors de l\'accès au microphone:', error);
                notificationManager.error('Impossible d\'accéder au microphone. Veuillez vérifier les autorisations de votre navigateur.');
            });
    }
    
    stopRecording(isCancel = false) {
        if (this.isRecording && this.mediaRecorder) {
            // Arrêter l'enregistrement
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Arrêter le minuteur
            this.stopTimer();
            
            // Arrêter le flux audio
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            
            // Réinitialiser le visualiseur
            this.visualizer.style.transform = 'scale(1)';
            this.visualizer.classList.remove('recording');
            this.visualizer.classList.remove('realtime');
            const bars = this.visualizer ? this.visualizer.querySelectorAll('.voice-bar') : [];
            bars.forEach((bar) => {
                bar.style.height = '';
            });
            
            // Si c'est une annulation, ne pas traiter l'audio
            if (isCancel) {
                appLog.log('Enregistrement annulé, pas de traitement audio');
                this.updateUI('ready');
                this.audioChunks = []; // Vider les chunks audio
                return;
            }
            
            // Mettre à jour l'interface pour le traitement
            this.updateUI('processing');
            
            // Arrêter l'animation du visualiseur
            this.visualizer.classList.remove('recording');
        }
    }
    
    resetRecording() {
        // Arrêter l'enregistrement s'il est en cours
        if (this.isRecording) {
            this.stopRecording();
        }
        
        // Réinitialiser les variables
        this.audioChunks = [];
        this.recordingTime = 0;
        
        // Réinitialiser l'interface
        this.updateUI('ready');
        this.timerDisplay.textContent = '00:00';
        this.resultsContainer.innerHTML = '';
        this.resultsContainer.classList.remove('show');
    }
    
    // Méthode utilitaire pour mettre à jour le statut
    updateStatus(message) {
        if (this.statusText) {
            this.statusText.textContent = message;
        }
    }

    processAudio() {
        // Mettre à jour le statut
        this.updateStatus('Traitement de l\'audio...');
        
        // Créer un blob audio à partir des chunks
        let mimeTypeForBlob = this.actualRecordingMimeType;
        if (!mimeTypeForBlob && this.audioChunks.length > 0 && this.audioChunks[0].type) {
            mimeTypeForBlob = this.audioChunks[0].type;
            appLog.log('MimeType pour MediaRecorder non défini, fallback sur le type du premier chunk:', mimeTypeForBlob);
        }
        if (!mimeTypeForBlob) {
            mimeTypeForBlob = 'audio/webm'; // Dernier recours, peu probable d'être atteint
            appLog.warn('MimeType pour le Blob non déterminable, fallback sur audio/webm');
        }
        const audioBlob = new Blob(this.audioChunks, { type: mimeTypeForBlob });
        appLog.log('Created audioBlob with type:', audioBlob.type);
        
        async function sendAudioData(blob) {
            this.updateStatus('Analyse en cours...');
            this.isProcessing = true;
            
            // Préparer les données
            const formData = new FormData();
            formData.append('audio', blob, 'recording' + this.getFileExtension(this.actualRecordingMimeType));
            formData.append('mime_type', this.actualRecordingMimeType);

            // Lire l'état du switch "Uniquement temporaire"
            const temporaryOnlySwitch = document.getElementById('temporaryOnlySwitch');
            if (temporaryOnlySwitch) {
                formData.append('temporary_only', temporaryOnlySwitch.checked);
                appLog.log("Temporary only switch state:", temporaryOnlySwitch.checked);
            }
            
            // Permettre aux classes dérivées d'ajouter des données spécifiques
            this.prepareFormData(formData);

            // Afficher un message de traitement
            this.updateUI('processing');

            try {
                appLog.log('Début de l\'envoi de l\'audio au serveur');
                // Envoyer l'audio au serveur
                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    body: formData
                });
                
                appLog.log('Réponse reçue du serveur:', response.status, response.statusText);
                appLog.log('Headers:', [...response.headers.entries()]);
                
                if (!response.ok) {
                    let errorMessage = `Erreur ${response.status}: ${response.statusText}`;
                    let errorType = 'unknown';
                    
                    try {
                        const errorData = await response.json();
                        appLog.error('Erreur du serveur:', errorData);
                        
                        if (errorData.error) {
                            errorMessage = errorData.error;
                            errorType = errorData.error_type || 'unknown';
                        }
                    } catch (e) {
                        // Si la réponse n'est pas du JSON valide, utiliser le texte brut
                        const errorText = await response.text();
                        appLog.error('Erreur du serveur (texte brut):', errorText);
                    }
                    
                    throw { message: errorMessage, type: errorType };
                }
                
                const data = await response.json();
                appLog.log('Données reçues du serveur:', data);
                appLog.log('Structure de la réponse:', JSON.stringify(data, null, 2));
                
                // S'assurer que data.items existe et est un tableau
                if (!data.items || !Array.isArray(data.items)) {
                    appLog.error('Format de réponse invalide:', data);
                    appLog.error('Type de data:', typeof data);
                    appLog.error('Clés disponibles:', Object.keys(data));
                    this.updateStatus('Format de réponse invalide');
                    this.resultsContainer.innerHTML = '<div class="alert alert-warning">Le format de la réponse est invalide. Veuillez réessayer.</div>';
                    this.updateUI('error');
                    return;
                }
                
                // S'assurer que chaque élément du tableau a au moins un nom
                const validItems = data.items.filter(item => item && typeof item === 'object' && item.name);
                if (validItems.length === 0 && data.items.length > 0) {
                    appLog.error('Aucun article valide dans la réponse:', data.items);
                    this.updateStatus('Aucun article valide');
                    this.resultsContainer.innerHTML = '<div class="alert alert-warning">Les articles reconnus ne sont pas dans un format valide. Veuillez réessayer.</div>';
                    this.updateUI('error');
                    return;
                }
                
                // Utiliser les articles valides plutôt que tous les articles
                data.items = validItems;
                
                appLog.log(`Affichage des résultats: ${data.items.length} articles trouvés`);
                appLog.log('Détail des articles:', data.items);
                
                // Vérifier que chaque article a les propriétés requises
                data.items.forEach((item, index) => {
                    appLog.log(`Article ${index}:`, item);
                    appLog.log(`  - Nom: ${item.name || 'MANQUANT'}`);
                    appLog.log(`  - ID: ${item.id || 'MANQUANT'}`);
                    appLog.log(`  - Conventionnel: ${item.is_conventional ? 'Oui' : 'Non'}`);
                });
                
                this.displayResults(data.items);
                this.updateStatus('Reconnaissance terminée');
                this.updateUI('results');
            } catch (error) {
                appLog.error('Erreur lors de l\'envoi des données audio:', error);
                
                // Déterminer le message d'erreur approprié en fonction du type d'erreur
                let errorMessage = 'Une erreur est survenue lors de l\'analyse audio. Veuillez réessayer.';
                let notificationTitle = 'Erreur de reconnaissance vocale';
                let errorDetails = '';
                
                // Vérifier si l'erreur est un objet avec type et message
                if (error && typeof error === 'object') {
                    const errorType = error.type || 'unknown';
                    
                    switch (errorType) {
                        case 'ai_service_error':
                            errorMessage = 'Le service d\'IA est temporairement indisponible. Veuillez réessayer dans quelques instants.';
                            notificationTitle = 'Service d\'IA indisponible';
                            break;
                            
                        case 'audio_format_error':
                            errorMessage = 'Le format audio n\'est pas pris en charge. Veuillez utiliser un format compatible.';
                            notificationTitle = 'Format audio non supporté';
                            break;
                            
                        default:
                            // Utiliser le message d'erreur fourni s'il existe
                            if (error.message) {
                                errorDetails = `<small class="text-muted mt-2 d-block">${error.message}</small>`;
                            }
                            break;
                    }
                } else if (error instanceof Error) {
                    errorDetails = `<small class="text-muted mt-2 d-block">${error.message}</small>`;
                }
                
                this.updateStatus('Erreur lors de l\'analyse. Veuillez réessayer.');
                this.resultsContainer.innerHTML = `<div class="alert alert-danger">${errorMessage}${errorDetails}</div>`;
                this.updateUI('error');
                
                // Notifier l'utilisateur avec le gestionnaire de notifications global s'il existe
                if (typeof notificationManager !== 'undefined') {
                    notificationManager.showNotification('error', notificationTitle, errorMessage);
                }
            } finally {
                this.isProcessing = false;
                if (typeof this.toggleStartStopButton === 'function') {
                    this.toggleStartStopButton(false);
                }
            }
        }
        
        sendAudioData.call(this, audioBlob);
    }
    
    startTimer() {
        this.recordingTime = 0;
        this.updateTimerDisplay();
        
        this.timer = setInterval(() => {
            this.recordingTime++;
            this.updateTimerDisplay();
            
            // Arrêter automatiquement l'enregistrement après le temps maximum
            if (this.recordingTime >= this.maxRecordingTime) {
                this.stopRecording();
            }
        }, 1000);
    }
    
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.recordingTime / 60).toString().padStart(2, '0');
        const seconds = (this.recordingTime % 60).toString().padStart(2, '0');
        this.timerDisplay.textContent = `${minutes}:${seconds}`;
    }
    
    updateUI(state) {
        // Récupérer les éléments DOM nécessaires
        const processingSpinner = document.getElementById('processingSpinner');
    
    // Mettre à jour l'interface en fonction de l'état
    switch (state) {
        case 'ready':
            if (this.startStopBtn) {
                this.startStopBtn.innerHTML = '<i class="bi bi-mic-fill me-1"></i> Démarrer';
                this.startStopBtn.disabled = false;
                this.startStopBtn.classList.remove('btn-danger');
                this.startStopBtn.classList.add('btn-primary');
            }
            if (this.confirmBtn) {
                this.confirmBtn.disabled = true;
            }
            if (this.statusText) {
                this.statusText.textContent = 'Prêt à enregistrer';
            }
            
            // Cacher le spinner de traitement et afficher le timer et le visualiseur
            if (processingSpinner) {
                processingSpinner.classList.add('d-none');
            }
            if (this.timerDisplay) {
                this.timerDisplay.classList.remove('d-none');
                this.timerDisplay.textContent = '00:00';
            }
            if (this.visualizer) {
                this.visualizer.classList.remove('d-none');
            }
            if (this.resultsContainer) {
                this.resultsContainer.innerHTML = '';
                this.resultsContainer.classList.remove('show');
                this.resultsContainer.style.display = 'none';
            }
            break;
            
        case 'recording':
            if (this.startStopBtn) {
                this.startStopBtn.innerHTML = '<i class="bi bi-stop-fill me-1"></i> Arrêter';
                this.startStopBtn.disabled = false;
                this.startStopBtn.classList.remove('btn-primary');
                this.startStopBtn.classList.add('btn-danger');
            }
            if (this.confirmBtn) {
                this.confirmBtn.disabled = true;
            }
            if (this.statusText) {
                this.statusText.textContent = 'Enregistrement en cours...';
            }
            break;
            
        case 'processing':
            if (this.startStopBtn) {
                this.startStopBtn.disabled = true;
            }
            if (this.confirmBtn) {
                this.confirmBtn.disabled = true;
            }
            if (this.statusText) {
                this.statusText.textContent = 'Traitement de l\'audio...';
            }
            
            // Afficher le spinner de traitement et cacher le timer et le visualiseur
            if (processingSpinner) {
                processingSpinner.classList.remove('d-none');
            }
            if (this.timerDisplay) {
                this.timerDisplay.classList.add('d-none');
            }
            if (this.visualizer) {
                this.visualizer.classList.add('d-none');
            }
            break;
            
        case 'results':
            if (this.startStopBtn) {
                this.startStopBtn.innerHTML = '<i class="bi bi-mic-fill me-1"></i> Nouveau';
                this.startStopBtn.disabled = false;
                this.startStopBtn.classList.remove('btn-danger');
                this.startStopBtn.classList.add('btn-primary');
            }
            if (this.confirmBtn) {
                this.confirmBtn.disabled = false;
            }
            
            // Cacher le spinner de traitement
            if (processingSpinner) {
                processingSpinner.classList.add('d-none');
            }
            
            // S'assurer que le conteneur de résultats est visible
            if (this.resultsContainer) {
                this.resultsContainer.classList.add('show');
                this.resultsContainer.style.display = 'block';
            }
            break;
            
        case 'error':
            if (this.startStopBtn) {
                this.startStopBtn.innerHTML = '<i class="bi bi-mic-fill me-1"></i> Réessayer';
                this.startStopBtn.disabled = false;
                this.startStopBtn.classList.remove('btn-danger');
                this.startStopBtn.classList.add('btn-primary');
            }
            if (this.confirmBtn) {
                this.confirmBtn.disabled = true;
            }
            
            // Cacher le spinner de traitement
            if (processingSpinner) {
                processingSpinner.classList.add('d-none');
            }
            
            // S'assurer que le conteneur de résultats est visible pour afficher l'erreur
            if (this.resultsContainer) {
                this.resultsContainer.classList.add('show');
                this.resultsContainer.style.display = 'block';
            }
            break;
        }
    }
    
    getFileExtension(mimeType) {
        if (!mimeType) return '.raw';
        // Simple map for common audio mime types to file extensions
        const mimeMap = {
            'audio/webm': '.webm',
            'audio/mp4': '.mp4',
            'audio/mpeg': '.mp3',
            'audio/ogg': '.ogg',
            'audio/wav': '.wav',
            'audio/flac': '.flac',
            'audio/x-m4a': '.m4a',
            'audio/m4a': '.m4a'
        };
        // Handle cases like 'audio/webm;codecs=opus'
        const baseMimeType = mimeType.split(';')[0].trim();
        return mimeMap[baseMimeType] || '.raw'; // Default to .raw if unknown
    }

    // Méthodes à implémenter par les classes dérivées
    
    prepareFormData(formData) {
        // À surcharger dans les classes dérivées si nécessaire
    }
    
    displayResults(items) {
        // À implémenter dans les classes dérivées
    }
    
    handleConfirmation() {
        // À implémenter dans les classes dérivées
    }
}

/**
 * Classe pour la reconnaissance vocale standard (articles temporaires)
 */
class VoiceRecognition extends BaseVoiceRecognition {
    constructor() {
        super({
            btnId: 'voiceRecognitionBtn',
            modalId: 'voiceRecognitionModal',
            startStopBtnId: 'startStopRecording',
            cancelBtnId: 'cancelRecording',
            confirmBtnId: 'confirmItems',
            timerDisplayId: 'recordingTimer',
            visualizerId: 'voiceVisualizer',
            resultsContainerId: 'voiceResults',
            statusTextId: 'recordingStatus',
            apiEndpoint: '/api/ai/voice-recognition'
        });
        
        // Initialisation
        this.init();
    }
    
    displayResults(items) {
        appLog.log('Début de displayResults avec', items ? items.length : 0, 'articles');
        
        // Vérifier que this.resultsContainer existe
        if (!this.resultsContainer) {
            appLog.error('ERREUR: this.resultsContainer est null ou undefined');
            return;
        }
        
        // S'assurer que le conteneur est visible
        this.resultsContainer.style.display = 'block';
        
        // Vider le conteneur de résultats
        this.resultsContainer.innerHTML = '';
        appLog.log('Conteneur de résultats vidé');
        
        if (!items || items.length === 0) {
            appLog.warn('Aucun article à afficher');
            this.resultsContainer.innerHTML = '<p class="text-muted">Aucun article détecté. Veuillez réessayer.</p>';
            this.confirmBtn.disabled = true;
            return;
        }
        
        // Vérifier la validité des articles
        const validItems = items.filter(item => item && typeof item === 'object' && item.name);
        if (validItems.length === 0) {
            appLog.warn('Aucun article valide à afficher');
            this.resultsContainer.innerHTML = '<p class="text-muted">Aucun article valide détecté. Veuillez réessayer.</p>';
            this.confirmBtn.disabled = true;
            return;
        }
        
        // Utiliser les articles valides
        items = validItems;
        
        // Créer une liste compacte d'articles
        const itemList = document.createElement('div');
        itemList.className = 'voice-item-list';
        appLog.log('Liste d\'articles créée');
        
        // Afficher le nombre d'articles identifiés
        const itemCount = document.createElement('div');
        itemCount.className = 'voice-item-count';
        itemCount.textContent = `${items.length} article(s) identifié(s)`;
        this.resultsContainer.appendChild(itemCount);
        appLog.log('Compteur d\'articles ajouté au DOM');
        
        // Afficher chaque article identifié
        appLog.log('Début de la boucle forEach pour afficher les articles');
        items.forEach((item, index) => {
            appLog.log(`Traitement de l'article ${index}:`, item);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'voice-item d-flex align-items-start';
            appLog.log(`Élément div créé pour l'article ${index}`);
            
            // Créer la structure de base avec la case à cocher
            const checkboxId = `item_${item.id || Math.random().toString(36).substr(2, 9)}`;
            appLog.log(`ID de checkbox généré: ${checkboxId}`);
            
            // Créer un conteneur pour le contenu (nom + badge)
            const contentContainer = document.createElement('div');
            contentContainer.className = 'd-flex flex-column';
            appLog.log(`Conteneur de contenu créé pour l'article ${index}`);
            
            // Ajouter la case à cocher et le label
            const checkbox = document.createElement('input');
            checkbox.className = 'form-check-input me-2';
            checkbox.type = 'checkbox';
            checkbox.value = item.name;
            checkbox.id = checkboxId;
            checkbox.checked = true;
            
            // Stocker les données des articles conventionnels dans le checkbox
            if (item.is_conventional) {
                checkbox.dataset.isConventional = 'true';
                checkbox.dataset.dbId = item.db_id || '';
                if (item.zone_id) checkbox.dataset.zoneId = item.zone_id;
                if (item.furniture_id) checkbox.dataset.furnitureId = item.furniture_id;
                if (item.drawer_id) checkbox.dataset.drawerId = item.drawer_id;
                if (item.location_info) checkbox.dataset.locationInfo = item.location_info;
            }
            
            itemElement.appendChild(checkbox);
            
            // Créer le label
            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = checkboxId;
            label.textContent = item.name;
            contentContainer.appendChild(label);
            
            // Ajouter un badge pour les articles conventionnels
            if (item.is_conventional) {
                const badgeDiv = document.createElement('div');
                badgeDiv.className = 'mt-1';
                
                const badge = document.createElement('span');
                badge.className = 'badge bg-success';
                badge.textContent = 'Article conventionnel';
                badgeDiv.appendChild(badge);
                
                // Ajouter les informations d'emplacement si disponibles
                if (item.location_info) {
                    const locationInfo = document.createElement('small');
                    locationInfo.className = 'text-muted ms-2';
                    locationInfo.textContent = item.location_info;
                    badgeDiv.appendChild(locationInfo);
                }
                
                contentContainer.appendChild(badgeDiv);
            }
            
            itemElement.appendChild(contentContainer);
            itemList.appendChild(itemElement);
            appLog.log(`Article ${index} ajouté à la liste`);
        });
        
        appLog.log('Tous les articles ont été traités, ajout de la liste au conteneur de résultats');
        this.resultsContainer.appendChild(itemList);
        appLog.log('Liste ajoutée au DOM');
        
        this.resultsContainer.classList.add('show');
        appLog.log('Classe "show" ajoutée au conteneur de résultats');
        
        // Activer le bouton de confirmation
        this.confirmBtn.disabled = false;
        appLog.log('Bouton de confirmation activé');
        
        // Vérifier l'état final du DOM
        appLog.log('État final du conteneur de résultats:', this.resultsContainer.innerHTML);
    }
    
    handleConfirmation() {
        // Récupérer tous les articles cochés
        const checkedItems = document.querySelectorAll('#voiceResults input[type="checkbox"]:checked');
        
        if (checkedItems.length === 0) {
            return;
        }
        
        // Pour chaque article coché, créer un article
        checkedItems.forEach(checkbox => {
            const itemName = checkbox.value;
            
            // Vérifier si c'est un article conventionnel
            if (checkbox.dataset.isConventional === 'true') {
                // C'est un article conventionnel, utiliser la fonction pour ajouter un article conventionnel
                if (typeof addConventionalItem === 'function') {
                    const itemData = {
                        name: itemName,
                        db_id: checkbox.dataset.dbId
                    };
                    
                    // Ajouter les informations d'emplacement si disponibles
                    if (checkbox.dataset.zoneId) itemData.zone_id = checkbox.dataset.zoneId;
                    if (checkbox.dataset.furnitureId) itemData.furniture_id = checkbox.dataset.furnitureId;
                    if (checkbox.dataset.drawerId) itemData.drawer_id = checkbox.dataset.drawerId;
                    if (checkbox.dataset.locationInfo) itemData.location_info = checkbox.dataset.locationInfo;
                    
                    addConventionalItem(itemData);
                } else {
                    // Si la fonction n'existe pas, utiliser la fonction standard
                    appLog.log('La fonction addConventionalItem n\'est pas disponible, utilisation de addTemporaryItem');
                    if (typeof addTemporaryItem === 'function') {
                        addTemporaryItem(itemName);
                    } else {
                        appLog.error('La fonction addTemporaryItem n\'est pas disponible');
                    }
                }
            } else {
                // C'est un article temporaire standard
                if (typeof addTemporaryItem === 'function') {
                    addTemporaryItem(itemName);
                } else {
                    appLog.error('La fonction addTemporaryItem n\'est pas disponible');
                }
            }
        });
    }
}

/**
 * Classe pour la reconnaissance vocale d'inventaire (articles permanents avec emplacements)
 */
class InventoryVoiceRecognition extends BaseVoiceRecognition {
    constructor(config) { // Accepter l'objet de configuration
        super({
            // btnId et modalId ne sont plus nécessaires pour la page dédiée
            btnId: null, 
            modalId: null,
            // Mapper les propriétés de config aux noms attendus par BaseVoiceRecognition
            startStopBtnId: config.startStopButton,
            cancelBtnId: config.cancelButton,
            confirmBtnId: config.confirmButton,
            timerDisplayId: config.timerElement,
            visualizerId: config.visualizerElement,
            resultsContainerId: config.resultsElement,
            statusTextId: config.statusElement,
            apiEndpoint: '/api/ai/inventory-voice' // L'endpoint reste le même
        });
        
        // Ajouter un log pour confirmer l'initialisation et les IDs
        appLog.log('InventoryVoiceRecognition initialisé avec config:', config);
        appLog.log('IDs mappés:', {
            startStopBtnId: this.startStopBtn ? this.startStopBtn.id : null,
            cancelBtnId: this.cancelBtn ? this.cancelBtn.id : null,
            confirmBtnId: this.confirmBtn ? this.confirmBtn.id : null
        });

        // Callbacks
        this.onSuccessCallback = config.onSuccess || function() {};
        this.onErrorCallback = config.onError || function() {};
        
        // Charger immédiatement les données de localisation
        this.loadLocationData().then(() => {
            appLog.log('Données de localisation chargées lors de l\'initialisation');
        });
        
        // Propriétés spécifiques à l'inventaire
        this.locations = {
            zones: [],
            furniture: [],
            drawers: []
        };
        this.recognizedItems = [];
        
        // Initialisation avec chargement des données
        this.initInventory();
    }
    
    async initInventory() {
        // Charger les données de localisation
        await this.loadLocationData();
        
        // Initialiser les écouteurs d'événements de base
        this.init();
    }
    
    async loadLocationData() {
        try {
            appLog.log('Début du chargement des données de localisation...');
            
            // Récupérer les données de zone
            const zonesResponse = await fetch('/api/location/zones');
            if (zonesResponse.ok) {
                this.locations.zones = await zonesResponse.json();
                appLog.log(`${this.locations.zones.length} zones chargées`);
            } else {
                appLog.error('Erreur lors du chargement des zones:', zonesResponse.status);
            }
            
            // Récupérer les données de meuble
            const furnitureResponse = await fetch('/api/location/furniture?all=true');
            if (furnitureResponse.ok) {
                this.locations.furniture = await furnitureResponse.json();
                appLog.log(`${this.locations.furniture.length} meubles chargés`);
            } else {
                appLog.error('Erreur lors du chargement des meubles:', furnitureResponse.status);
            }
            
            // Récupérer les données de tiroir
            const drawersResponse = await fetch('/api/location/drawers?all=true');
            if (drawersResponse.ok) {
                this.locations.drawers = await drawersResponse.json();
                appLog.log(`${this.locations.drawers.length} tiroirs chargés`);
            } else {
                appLog.error('Erreur lors du chargement des tiroirs:', drawersResponse.status);
            }
            
            appLog.log('Données de localisation chargées avec succès:', this.locations);
            
            // Vérifier que le contexte est valide (au moins une zone, un meuble et un tiroir)
            if (!this.locations.zones.length || !this.locations.furniture.length || !this.locations.drawers.length) {
                appLog.error('Contexte de localisation incomplet ou vide');
            }
        } catch (error) {
            appLog.error('Erreur lors du chargement des données de localisation:', error);
        }
    }
    
    prepareFormData(formData) {
        // Vérifier que les données de localisation sont complètes
        if (!this.locations.zones || !this.locations.zones.length ||
            !this.locations.furniture || !this.locations.furniture.length ||
            !this.locations.drawers || !this.locations.drawers.length) {
            appLog.error('Données de localisation incomplètes, tentative de rechargement...');
            this.loadLocationData(); // Tenter de recharger
        }
        
        // Formater le contexte en incluant uniquement les champs nécessaires
        const formattedLocations = {
            zones: this.locations.zones.map(zone => ({ id: zone.id, name: zone.name })),
            furniture: this.locations.furniture.map(furniture => ({
                id: furniture.id,
                name: furniture.name,
                zone_id: furniture.zone_id
            })),
            drawers: this.locations.drawers.map(drawer => ({
                id: drawer.id,
                name: drawer.name,
                furniture_id: drawer.furniture_id
            }))
        };
        
        const locationsJSON = JSON.stringify(formattedLocations);
        appLog.log('Envoi du contexte des emplacements (formaté):', formattedLocations);
        formData.append('context', locationsJSON);
    }
    
    resetRecording() {
        super.resetRecording();
        // Réinitialiser les items reconnus
        this.recognizedItems = [];
    }
    
    displayResults(newlyRecognizedItemsFromServer) {
        // Si de nouveaux articles sont fournis (par exemple, depuis la réponse du serveur),
        // mettre à jour this.recognizedItems.
        if (newlyRecognizedItemsFromServer) {
            this.recognizedItems = newlyRecognizedItemsFromServer
                .filter(item => item != null) // Filtrer les éléments null ou undefined
                .map(serverItem => ({
                    name: serverItem.name || '',
                    zone_id: serverItem.zone_id || null,
                    furniture_id: serverItem.furniture_id || null,
                    drawer_id: serverItem.drawer_id || null,
                    // 'included' est true par défaut, ou conserve sa valeur si déjà présente.
                    included: serverItem.hasOwnProperty('included') ? serverItem.included : true,
                    // Copier d'autres propriétés si nécessaire, par exemple: ...serverItem
                }));
        }
        // Si newlyRecognizedItemsFromServer est null/undefined (appel pour rafraîchissement),
        // this.recognizedItems conserve sa valeur actuelle.

        // Toujours utiliser this.recognizedItems comme source de vérité pour l'affichage.
        const itemsToRender = this.recognizedItems || [];

        this.resultsContainer.innerHTML = ''; // Vider le conteneur
        appLog.log('Affichage des articles (this.recognizedItems):', itemsToRender);

        if (itemsToRender.length > 0) {
            const itemCountText = document.createElement('p');
            itemCountText.className = 'text-muted mb-2';
            itemCountText.textContent = `${itemsToRender.length} article(s) potentiel(s) identifié(s). Vérifiez et modifiez si nécessaire.`;
            this.resultsContainer.appendChild(itemCountText);

            const listGroup = document.createElement('ul');
            listGroup.className = 'list-group inventory-results-list';

            const headerLi = document.createElement('li');
            headerLi.className = 'list-group-item d-none d-md-block';
            headerLi.innerHTML = `
                <div class="row fw-bold gx-2">
                    <div class="col-auto" style="width: 50px;"><small>Incl.</small></div>
                    <div class="col-md-3"><small>Nom de l'article</small></div>
                    <div class="col-md-2"><small>Zone</small></div>
                    <div class="col-md-2"><small>Meuble</small></div>
                    <div class="col-md-2"><small>Tiroir/Étagère</small></div>
                    <div class="col-auto" style="width: 50px;"><small>Action</small></div>
                </div>
            `;
            listGroup.appendChild(headerLi);

            itemsToRender.forEach((currentItem, index) => {
                // currentItem est maintenant directement un élément de this.recognizedItems (itemsToRender)
                // et est garanti d'avoir les propriétés 'name' et 'included'.
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item voice-item-row';
                listItem.setAttribute('data-index', index);

                listItem.innerHTML = `
                    <div class="row gx-2 align-items-center">
                        <div class="col-auto" style="width: 50px;">
                            <input class="form-check-input item-include-checkbox" type="checkbox" id="item_include_${index}" data-index="${index}" ${currentItem.included ? 'checked' : ''}>
                        </div>
                        <div class="col-12 col-md-3 mb-2 mb-md-0">
                            <input type="text" class="form-control form-control-sm item-name-input" value="${currentItem.name}" id="item_name_${index}" data-index="${index}" placeholder="Nom">
                        </div>
                        <div class="col-12 col-md-2 mb-2 mb-md-0">
                            <select class="form-select form-select-sm item-location-select item-zone-select" id="item_zone_${index}" data-index="${index}" data-type="zone">
                                ${this.generateZoneOptions(currentItem.zone_id)}
                            </select>
                        </div>
                        <div class="col-12 col-md-2 mb-2 mb-md-0">
                            <select class="form-select form-select-sm item-location-select item-furniture-select" id="item_furniture_${index}" data-index="${index}" data-type="furniture">
                                ${this.generateFurnitureOptions(currentItem.zone_id, currentItem.furniture_id)}
                            </select>
                        </div>
                        <div class="col-12 col-md-2 mb-2 mb-md-0">
                            <select class="form-select form-select-sm item-location-select item-drawer-select" id="item_drawer_${index}" data-index="${index}" data-type="drawer">
                                ${this.generateDrawerOptions(currentItem.furniture_id, currentItem.drawer_id)}
                            </select>
                        </div>
                        <div class="col-auto ms-auto ms-md-0" style="width: 50px;">
                            <button type="button" class="btn btn-sm btn-outline-danger item-remove-btn" data-index="${index}" title="Supprimer cet article">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
                listGroup.appendChild(listItem);
            });

            this.resultsContainer.appendChild(listGroup);
            this.addSelectListeners();
            this.addItemRowListeners();

            this.resultsContainer.classList.add('show');
            if (this.confirmBtn) this.confirmBtn.disabled = itemsToRender.length === 0;

        } else {
            this.resultsContainer.innerHTML = '<div class="alert alert-info">Aucun article à afficher. Lancez un enregistrement.</div>';
            this.resultsContainer.classList.add('show');
            if (this.confirmBtn) this.confirmBtn.disabled = true;
        }    }
    
    generateZoneOptions(selectedZoneId) {
        let options = '<option value="">Sélectionnez une zone</option>';
        
        this.locations.zones.forEach(zone => {
            const selected = zone.id == selectedZoneId ? 'selected' : '';
            options += `<option value="${zone.id}" ${selected}>${zone.name}</option>`;
        });
        
        return options;
    }
    
    generateFurnitureOptions(zoneId, selectedFurnitureId) {
        let options = '<option value="">Sélectionnez un meuble</option>';
        
        // Filtrer les meubles par zone
        const filteredFurniture = this.locations.furniture.filter(f => f.zone_id == zoneId);
        
        filteredFurniture.forEach(furniture => {
            const selected = furniture.id == selectedFurnitureId ? 'selected' : '';
            options += `<option value="${furniture.id}" ${selected}>${furniture.name}</option>`;
        });
        
        return options;
    }
    
    generateDrawerOptions(furnitureId, selectedDrawerId) {
        let options = '<option value="">Sélectionnez un tiroir/niveau</option>';
        
        // Filtrer les tiroirs par meuble
        const filteredDrawers = this.locations.drawers.filter(d => d.furniture_id == furnitureId);
        
        filteredDrawers.forEach(drawer => {
            const selected = drawer.id == selectedDrawerId ? 'selected' : '';
            options += `<option value="${drawer.id}" ${selected}>${drawer.name}</option>`;
        });
        
        return options;
    }
    
    addSelectListeners() {
        // Ajouter des écouteurs pour les sélecteurs de zone
        document.querySelectorAll('[id^="item_zone_"]').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = e.target.dataset.index;
                const zoneId = e.target.value;
                const furnitureSelect = document.getElementById(`item_furniture_${index}`);
                const drawerSelect = document.getElementById(`item_drawer_${index}`);
                
                // Mettre à jour les options de meuble
                furnitureSelect.innerHTML = this.generateFurnitureOptions(zoneId, '');
                
                // Réinitialiser le sélecteur de tiroir
                drawerSelect.innerHTML = '<option value="">Sélectionnez d\'abord un meuble</option>';
                
                // Mettre à jour l'objet recognizedItems
                this.recognizedItems[index].zone_id = zoneId;
                this.recognizedItems[index].furniture_id = '';
                this.recognizedItems[index].drawer_id = '';
            });
        });
        
        // Ajouter des écouteurs pour les sélecteurs de meuble
        document.querySelectorAll('[id^="item_furniture_"]').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = e.target.dataset.index;
                const furnitureId = e.target.value;
                const drawerSelect = document.getElementById(`item_drawer_${index}`);
                
                // Mettre à jour les options de tiroir
                drawerSelect.innerHTML = this.generateDrawerOptions(furnitureId, '');
                
                // Mettre à jour l'objet recognizedItems
                this.recognizedItems[index].furniture_id = furnitureId;
                this.recognizedItems[index].drawer_id = '';
            });
        });
        
        // Ajouter des écouteurs pour les sélecteurs de tiroir
        document.querySelectorAll('[id^="item_drawer_"]').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = e.target.dataset.index;
                const drawerId = e.target.value;
                
                // Mettre à jour l'objet recognizedItems
                this.recognizedItems[index].drawer_id = drawerId;
            });
        });
        
        // Ajouter des écouteurs pour les champs de nom
        document.querySelectorAll('[id^="item_name_"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = e.target.dataset.index;
                const name = e.target.value;
                
                // Mettre à jour l'objet recognizedItems
                this.recognizedItems[index].name = name;
            });
        });
    }

    addItemRowListeners() {
        this.resultsContainer.querySelectorAll('.item-remove-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.currentTarget.dataset.index, 10);
                if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < this.recognizedItems.length) {
                    this.recognizedItems.splice(indexToRemove, 1); // Supprimer l'élément
                    this.displayResults(); // Rafraîchir l'affichage pour refléter la suppression et réindexer
                }
            });
        });

        this.resultsContainer.querySelectorAll('.item-name-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.currentTarget.dataset.index, 10);
                if (!isNaN(index) && this.recognizedItems[index]) {
                    this.recognizedItems[index].name = e.currentTarget.value;
                }
            });
        });

        this.resultsContainer.querySelectorAll('.item-include-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const index = parseInt(e.currentTarget.dataset.index, 10);
                if (!isNaN(index) && this.recognizedItems[index]) {
                    this.recognizedItems[index].included = e.currentTarget.checked;
                }
            });
        });
    }
    
    handleConfirmation() {
        // Filtrer les articles reconnus pour ne garder que ceux qui sont marqués comme inclus
        // (la propriété 'included' est gérée par addItemRowListeners)
        // Si 'included' n'est pas défini, on considère par défaut que l'article est inclus.
        const itemsToProcess = this.recognizedItems.filter(item => item.included !== false);

        if (itemsToProcess.length === 0) {
            notificationManager.info('Aucun article n\'est sélectionné pour l\'ajout.');
            return;
        }

        // Valider que les articles à ajouter ont bien tous les champs de localisation requis
        const itemsToAdd = itemsToProcess.filter(item => {
            const isValid = item.name && item.name.trim() !== '' && 
                            item.zone_id && item.furniture_id && item.drawer_id;
            if (!isValid && (item.included !== false)) { // Notifier seulement si l'utilisateur voulait l'inclure
                notificationManager.warning(`L'article "${item.name || 'Sans nom'}" est incomplet. Veuillez vérifier son nom et sa localisation.`);
            }
            return isValid;
        });

        if (itemsToAdd.length === 0) {
            notificationManager.error('Aucun article complet à ajouter. Veuillez vérifier les informations manquantes.');
            return;
        }

        appLog.log('Items à ajouter au serveur:', itemsToAdd);

        // Envoyer les articles au serveur
        fetch('/api/items/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items: itemsToAdd })
        })
        .then(response => {
            if (!response.ok) {
                // Essayer de lire le message d'erreur du serveur s'il y en a un
                return response.json().then(errData => {
                    throw new Error(errData.message || 'Erreur lors de l\'ajout des articles');
                }).catch(() => {
                    throw new Error('Erreur HTTP ' + response.status + ' lors de l\'ajout des articles');
                });
            }
            return response.json();
        })
        .then(data => {
            notificationManager.success(`${data.added_count} article(s) ajouté(s) avec succès.`);
            // Appeler le callback onSuccess si défini
            if (this.onSuccessCallback) {
                this.onSuccessCallback(data);
            }
            
            // Réinitialiser complètement l'interface pour permettre un nouvel enregistrement
            this.resetRecording();
            this.updateStatus('Prêt à enregistrer un nouvel article');
            // Remettre le texte du bouton à son état initial
            if (this.startStopBtn) {
                this.startStopBtn.innerHTML = '<i class="bi bi-mic-fill me-2"></i>Démarrer l\'enregistrement';
                this.startStopBtn.classList.remove('btn-danger');
                this.startStopBtn.classList.add('btn-primary');
            }
        })
        .catch(error => {
            appLog.error('Erreur lors de la confirmation:', error);
            notificationManager.error(error.message || 'Une erreur est survenue lors de l\'ajout.');
            // Appeler le callback onError si défini
            if (this.onErrorCallback) {
                this.onErrorCallback(error);
            }
        });
    }
}

// Initialiser les modules de reconnaissance vocale lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser la reconnaissance vocale standard
    if (document.getElementById('voiceRecognitionBtn')) {
        window.voiceRecognition = new VoiceRecognition();
    }
    
    // Initialiser la reconnaissance vocale d'inventaire
    if (document.getElementById('inventoryVoiceBtn')) {
        window.inventoryVoiceRecognition = new InventoryVoiceRecognition();
    }
});
