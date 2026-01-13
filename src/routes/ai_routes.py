"""
Routes unifiées pour les fonctionnalités d'IA et de reconnaissance vocale
"""
import json
from flask import Blueprint, request, jsonify, current_app, session # Ajout de session
from src.services.ai_service import ai_service # ai_service est l'instance, AIService est la classe
from src.services.ai_service import AIService # Import de la classe pour instanciation si nécessaire ailleurs
from src.models import db
from src.models.item import Item # Item est déjà importé

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai') # Ajout du préfixe d'URL

@ai_bp.route('/voice-recognition', methods=['POST']) # Suppression de /api/ du chemin
def voice_recognition():
    """
    Endpoint pour traiter l'audio et extraire les noms d'articles
    """
    if 'audio' not in request.files:
        return jsonify({'error': 'Aucun fichier audio n\'a été fourni'}), 400
    
    audio_file = request.files['audio']
    audio_mime_type = request.form.get('mime_type') or request.form.get('mimeType') or 'audio/webm'
    
    if audio_file.filename == '':
        return jsonify({'error': 'Nom de fichier audio invalide'}), 400
    
    temporary_only = request.form.get('temporary_only', 'false').lower() == 'true'
    current_app.logger.debug(f"[voice_recognition] temporary_only flag from form: {request.form.get('temporary_only')}, parsed as: {temporary_only}")
    
    try:
        # Log du type MIME pour le débogage
        current_app.logger.info(f"Utilisation du suffixe '{ai_service.getFileExtension(audio_mime_type)}' pour le mimeType '{audio_mime_type}' (base: '{audio_mime_type.split(';')[0] if ';' in audio_mime_type else audio_mime_type}')")
        
        # Utiliser le service AI pour traiter l'audio
        items = ai_service.process_audio_file(audio_file, audio_mime_type=audio_mime_type, temporary_only=temporary_only)
        
        # Log détaillé du résultat pour le débogage
        current_app.logger.info(f"Reconnaissance vocale réussie: {len(items)} articles identifiés")
        
        # Vérifier la structure des données
        import json
        current_app.logger.info(f"Structure des données: {json.dumps(items, indent=2)}")
        
        # Vérifier que chaque article a un ID et un nom
        for i, item in enumerate(items):
            current_app.logger.info(f"Article {i}: id={item.get('id', 'MANQUANT')}, name={item.get('name', 'MANQUANT')}")
        
        # Créer la réponse JSON
        response_data = {'items': items}
        current_app.logger.info(f"Réponse JSON finale: {json.dumps(response_data, indent=2)}")
        
        return jsonify(response_data)
    
    except Exception as e:
        error_message = str(e)
        error_type = "server_error"
        
        # Catégoriser les erreurs pour une meilleure gestion côté client
        if "API OpenAI" in error_message or "service d'IA" in error_message:
            error_type = "ai_service_error"
        elif "fichier audio" in error_message:
            error_type = "audio_format_error"
        
        current_app.logger.error(f"Erreur dans voice_recognition: {error_message}", exc_info=True)
        return jsonify({
            'error': error_message,
            'error_type': error_type
        }), 500

@ai_bp.route('/inventory-voice', methods=['POST']) # Suppression de /api/ du chemin
def inventory_voice_recognition():
    """
    Endpoint pour traiter l'audio et extraire les articles avec leurs emplacements
    """
    if 'audio' not in request.files:
        return jsonify({'error': 'Aucun fichier audio n\'a été fourni'}), 400
    
    audio_file = request.files['audio']
    audio_mime_type = request.form.get('mime_type') or request.form.get('mimeType') or 'audio/webm'
    
    if audio_file.filename == '':
        return jsonify({'error': 'Nom de fichier audio invalide'}), 400
    
    # Récupérer le contexte des emplacements
    context = {}
    if 'context' in request.form:
        try:
            context = json.loads(request.form['context'])
        except:
            pass
    
    try:
        # Utiliser le service AI pour traiter l'audio avec contexte d'emplacements
        items = ai_service.process_audio_file(audio_file, is_inventory=True, locations_context=context, audio_mime_type=audio_mime_type)
        return jsonify({'items': items})
    
    except Exception as e:
        current_app.logger.error(f"Erreur dans inventory_voice_recognition: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@ai_bp.route('/chat/inventory', methods=['POST'])
def handle_inventory_chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Authentification requise'}), 401

    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({'error': 'Données de requête invalides ou manquantes'}), 400
        
    user_query = data.get('query')

    if not user_query:
        return jsonify({'error': 'La requête ne peut pas être vide'}), 400

    # ai_service est déjà l'instance de AIService importée au niveau du module
    try:
        all_items = Item.query.all() # Item est déjà importé
        ai_response_text = ai_service.get_inventory_chat_response(all_items, user_query)
        return jsonify({'response': ai_response_text})

    except Exception as e:
        current_app.logger.error(f"Erreur lors de l'appel à AIService pour le chat: {e}", exc_info=True)
        return jsonify({'error': f'Erreur du service IA: {str(e)}'}), 500
