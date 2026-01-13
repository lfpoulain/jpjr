from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify
from sqlalchemy.exc import SQLAlchemyError
from src.models import db
from src.models.user import User
from src.models.item import Item
from src.models.borrow import Borrow
from src.models.location import Zone, Furniture, Drawer
from config.database import save_config as save_db_config, get_postgres_config_values, DB_TYPE
from config.app_config import get_app_config_values, save_app_config_value

# Note: La classe ItemTempo n'est plus utilisée après la refactorisation

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


@admin_bp.route('/db-config', methods=['GET', 'POST'])
def db_config():
    """
    Configuration de la base de données
    """
    if 'user_id' not in session:
        return redirect(url_for('main.index'))
    
    if request.method == 'POST':
        host = request.form.get('host')
        database = request.form.get('database')
        user = request.form.get('user')
        password = request.form.get('password')
        port = request.form.get('port')
        
        if host and database and user and password and port:
            try:
                # Sauvegarder la nouvelle configuration
                save_db_config(host, database, user, password, port)
                
                # Notifier l'utilisateur du changement
                flash('Configuration de la base de données PostgreSQL mise à jour. Un redémarrage de l''application est nécessaire pour appliquer les changements.', 'success')
                return redirect(url_for('admin.db_config'))
            except Exception as e:
                flash(f'Erreur lors de la mise à jour de la configuration: {str(e)}', 'error')
        else:
            flash('Tous les champs sont obligatoires', 'error')
    
    # Récupérer la configuration actuelle et déterminer le message d'information spécifique à la page pour les requêtes GET
    current_config = {}
    db_type_in_use = DB_TYPE
    page_info_message = None
    page_info_category = None

    if db_type_in_use == 'postgresql':
        current_config = get_postgres_config_values()
        if request.method == 'GET':
            page_info_message = 'Le formulaire ci-dessous permet de modifier la configuration de PostgreSQL. Un redémarrage est requis pour appliquer les changements.'
            page_info_category = 'info'
    elif db_type_in_use == 'sqlite':
        current_config = {'message': 'SQLite est actuellement utilisé. La configuration se fait via les variables d''environnement (.env).'}
        if request.method == 'GET':
            page_info_message = 'SQLite est actif. La configuration de la base de données se fait via les variables d''environnement dans le fichier .env. Ce formulaire est désactivé.'
            page_info_category = 'warning'
    else:
        current_config = {'message': f'Type de base de données inconnu: {db_type_in_use}'}
        if request.method == 'GET':
            page_info_message = f'Type de base de données non reconnu: {db_type_in_use}. Vérifiez la variable DB_TYPE dans votre fichier .env.'
            page_info_category = 'danger'

    return render_template('admin/db_config.html', 
                           config=current_config, 
                           db_type=db_type_in_use,
                           page_info_message=page_info_message,
                           page_info_category=page_info_category)


@admin_bp.route('/app-config', methods=['GET', 'POST'])
def app_config():
    """
    Configuration de l'application (ex: Clé API OpenAI).
    """
    if 'user_id' not in session:
        return redirect(url_for('main.index'))

    page_info_message = None
    page_info_category = None

    if request.method == 'POST':
        openai_api_key_from_form = request.form.get('OPENAI_API_KEY')
        openai_transcription_model_from_form = request.form.get('OPENAI_TRANSCRIPTION_MODEL')
        openai_completion_model_from_form = request.form.get('OPENAI_COMPLETION_MODEL')
        openai_transcription_model_custom_from_form = request.form.get('OPENAI_TRANSCRIPTION_MODEL_CUSTOM')
        openai_completion_model_custom_from_form = request.form.get('OPENAI_COMPLETION_MODEL_CUSTOM')
 
        if openai_api_key_from_form: # Sauvegarder seulement si une nouvelle clé est entrée
            if save_app_config_value('OPENAI_API_KEY', openai_api_key_from_form):
                flash('Clé API OpenAI mise à jour avec succès. Un redémarrage de l\'application peut être nécessaire.', 'success')
            else:
                flash('Erreur lors de la mise à jour de la clé API OpenAI.', 'error')

        if openai_transcription_model_from_form is not None:
            transcription_model_to_save = openai_transcription_model_from_form
            if transcription_model_to_save == '__custom__':
                transcription_model_to_save = (openai_transcription_model_custom_from_form or '').strip()
            if save_app_config_value('OPENAI_TRANSCRIPTION_MODEL', transcription_model_to_save):
                flash('Modèle de transcription OpenAI mis à jour. Un redémarrage de l\'application peut être nécessaire.', 'success')
            else:
                flash('Erreur lors de la mise à jour du modèle de transcription OpenAI.', 'error')

        if openai_completion_model_from_form is not None:
            completion_model_to_save = openai_completion_model_from_form
            if completion_model_to_save == '__custom__':
                completion_model_to_save = (openai_completion_model_custom_from_form or '').strip()
            if save_app_config_value('OPENAI_COMPLETION_MODEL', completion_model_to_save):
                flash('Modèle de chat OpenAI mis à jour. Un redémarrage de l\'application peut être nécessaire.', 'success')
            else:
                flash('Erreur lors de la mise à jour du modèle de chat OpenAI.', 'error')
         
        # Gérer d'autres clés de configuration ici si nécessaire à l'avenir
        return redirect(url_for('admin.app_config'))

    # Pour les requêtes GET
    current_app_config = get_app_config_values()
    
    config_for_template = {}
    for key, value in current_app_config.items():
        if value: 
            if key in ['OPENAI_TRANSCRIPTION_MODEL', 'OPENAI_COMPLETION_MODEL']:
                config_for_template[key] = value
            else:
                config_for_template[key] = "Configurée"
        else:
            config_for_template[key] = "Non configurée"

    if request.method == 'GET':
        page_info_message = "Gérez ici les configurations globales de l'application, comme les clés API. Les modifications peuvent nécessiter un redémarrage de l'application."
        page_info_category = 'info'
        
    return render_template('admin/app_config.html',
                           config=config_for_template,
                           raw_config=current_app_config,
                           page_info_message=page_info_message,
                           page_info_category=page_info_category)

# Route principale d'administration - redirige vers la liste des articles
@admin_bp.route('/')
def admin_dashboard():
    return redirect(url_for('admin.items_list'))

# Gestion des utilisateurs
@admin_bp.route('/users')
def user_list():
    users_with_borrows = []
    users = db.session.query(User).order_by(User.name).all()
    
    for user in users:
        active_borrows = db.session.query(Borrow).filter(Borrow.user_id == user.id, Borrow.return_date == None).count()
        users_with_borrows.append({
            'id': user.id,
            'name': user.name,
            'active_borrows_count': active_borrows
        })
    
    return render_template('admin/user_list.html', users=users_with_borrows)

@admin_bp.route('/users/delete/<int:user_id>', methods=['POST'])
def delete_user(user_id):
    try:
        # Vérifier s'il y a des emprunts actifs pour cet utilisateur
        active_borrows = db.session.query(Borrow).filter(
            Borrow.user_id == user_id,
            Borrow.return_date == None
        ).count()
        
        if active_borrows > 0:
            flash(f"Impossible de supprimer l'utilisateur car il a {active_borrows} emprunt(s) actif(s).", "danger")
            return redirect(url_for('admin.user_list'))
        
        user = db.session.get(User, user_id)
        if user:
            db.session.delete(user)
            db.session.commit()
            flash("Utilisateur supprimé avec succès.", "success")
        else:
            flash("Utilisateur non trouvé.", "danger")
        
        return redirect(url_for('admin.user_list'))
    except Exception as e:
        db.session.rollback()
        flash(f"Erreur lors de la suppression de l'utilisateur: {str(e)}", "danger")
        return redirect(url_for('admin.user_list'))

# Gestion des articles
@admin_bp.route('/items')
def items_list():
    # Récupérer le paramètre de filtre s'il existe
    filter_type = request.args.get('filter', 'all')  # Par défaut : afficher tous les articles
    search_term = request.args.get('search', '').strip()
    
    # Construire la requête de base
    query = db.session.query(Item)
    
    # Appliquer le filtre si nécessaire
    if filter_type == 'temporary':
        query = query.filter(Item.is_temporary == True)
    elif filter_type == 'conventional':
        query = query.filter(Item.is_temporary == False)

    # Appliquer le filtre de recherche si un terme est fourni
    if search_term:
        query = query.filter(Item.name.ilike(f'%{search_term}%'))
    
    # Trier les résultats par nom
    items = query.order_by(Item.name).all()
    
    items_list = []
    for item in items:
        # Vérifier si l'article est emprunté et récupérer l'emprunteur
        borrow_record = db.session.query(Borrow).filter(Borrow.item_id == item.id, Borrow.return_date == None).first()
        is_borrowed = borrow_record is not None
        borrower_name = None
        if borrow_record:
            user = db.session.get(User, borrow_record.user_id)
            if user:
                borrower_name = user.name
        
        # Créer un dictionnaire avec les informations de l'article
        item_dict = {
            'id': item.id,
            'name': item.name,
            'is_borrowed': is_borrowed,
            'is_temporary': item.is_temporary,
            'borrower_name': borrower_name  # Ajouter le nom de l'emprunteur
        }
        
        # Ajouter les informations de localisation pour les articles non temporaires
        if not item.is_temporary:
            item_dict.update({
                'zone_name': item.zone_rel.name if item.zone_rel else 'Non spécifié',
                'furniture_name': item.furniture_rel.name if item.furniture_rel else 'Non spécifié',
                'drawer_name': item.drawer_rel.name if item.drawer_rel else 'Non spécifié'
            })
        else:
            item_dict.update({
                'zone_name': 'N/A',
                'furniture_name': 'N/A',
                'drawer_name': 'N/A'
            })
        
        items_list.append(item_dict)
    
    return render_template('admin/items_list.html', 
                           items=items_list, 
                           current_filter=filter_type,
                           items_count=len(items_list),
                           search_term=search_term)  # Passer le terme de recherche au template

@admin_bp.route('/add-item', methods=['GET', 'POST'])
def add_item():
    zones_query = db.session.query(Zone).order_by(Zone.name).all()
    furnitures_query = db.session.query(Furniture).order_by(Furniture.name).all()
    drawers_query = db.session.query(Drawer).order_by(Drawer.name).all()

    form_data = {'name': '', 'selected_zone': None, 'selected_furniture': None, 'selected_drawer': None}

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        zone_id_str = request.form.get('zone_id')
        furniture_id_str = request.form.get('furniture_id')
        drawer_id_str = request.form.get('drawer_id')

        form_data['name'] = name
        try:
            form_data['selected_zone'] = int(zone_id_str) if zone_id_str else None
        except ValueError:
            form_data['selected_zone'] = None
        try:
            form_data['selected_furniture'] = int(furniture_id_str) if furniture_id_str else None
        except ValueError:
            form_data['selected_furniture'] = None
        try:
            form_data['selected_drawer'] = int(drawer_id_str) if drawer_id_str else None
        except ValueError:
            form_data['selected_drawer'] = None

        if not name:
            flash("Le nom de l'article est requis.", "danger")
            return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)
        
        if not zone_id_str or not furniture_id_str or not drawer_id_str:
             flash("Toutes les informations de localisation (Zone, Mobilier, Tiroir) sont requises.", "danger")
             return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)

        try:
            zone_id = int(zone_id_str)
            furniture_id = int(furniture_id_str)
            drawer_id = int(drawer_id_str)
            form_data['selected_zone'] = zone_id
            form_data['selected_furniture'] = furniture_id
            form_data['selected_drawer'] = drawer_id
        except ValueError:
            flash("Les identifiants de localisation (Zone, Mobilier, Tiroir) doivent être des nombres valides.", "danger")
            return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)
        
        try:
            existing_item = Item.query.filter_by(
                name=name,
                zone_id=zone_id,
                furniture_id=furniture_id,
                drawer_id=drawer_id,
                is_temporary=False
            ).first()

            if existing_item:
                flash(f"Un article conventionnel nommé '{name}' existe déjà à cet emplacement exact.", "warning")
                return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)

            new_item = Item(
                name=name,
                zone_id=zone_id,
                furniture_id=furniture_id,
                drawer_id=drawer_id,
                is_temporary=False
            )
            db.session.add(new_item)
            db.session.commit()
            
            flash("Article ajouté avec succès.", "success")
            return redirect(url_for('admin.items_list'))
        
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"Erreur de base de données lors de l'ajout de l'article: {str(e)}", "danger")
            return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)
        except Exception as e:
            db.session.rollback()
            flash(f"Erreur inattendue lors de l'ajout de l'article: {str(e)}", "danger")
            return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)

    return render_template('admin/add_item.html', zones=zones_query, furnitures=furnitures_query, drawers=drawers_query, **form_data)

@admin_bp.route('/edit-item/<int:item_id>', methods=['GET', 'POST'])
def edit_item(item_id):
    item = db.session.get(Item, item_id)
    if not item:
        flash("Article non trouvé.", "danger")
        return redirect(url_for('admin.items_list'))
    
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        zone_id = request.form.get('zone_id')
        furniture_id = request.form.get('furniture_id')
        drawer_id = request.form.get('drawer_id')
        
        if not name:
            flash("Le nom de l'article est requis.", "danger")
            return redirect(url_for('admin.edit_item', item_id=item_id))
        
        if not zone_id or not furniture_id or not drawer_id:
            flash("Toutes les informations de localisation sont requises.", "danger")
            return redirect(url_for('admin.edit_item', item_id=item_id))
        
        try:
            item.name = name
            item.zone_id = zone_id
            item.furniture_id = furniture_id
            item.drawer_id = drawer_id
            
            db.session.commit()
            
            flash("Article modifié avec succès.", "success")
            return redirect(url_for('admin.items_list'))
        except Exception as e:
            db.session.rollback()
            flash(f"Erreur lors de la modification de l'article: {str(e)}", "danger")
            return redirect(url_for('admin.edit_item', item_id=item_id))
    
    # GET request - afficher le formulaire
    zones = db.session.query(Zone).order_by(Zone.name).all()
    furnitures = db.session.query(Furniture).order_by(Furniture.name).all()
    drawers = db.session.query(Drawer).order_by(Drawer.name).all()
    
    return render_template('admin/edit_item.html', item=item, zones=zones, furnitures=furnitures, drawers=drawers)

@admin_bp.route('/items/delete/<int:item_id>', methods=['POST'])
def delete_item(item_id):
    try:
        item = db.session.get(Item, item_id)
        if not item:
            return jsonify(success=False, error="Article non trouvé."), 404

        # Vérifier si l'article est emprunté
        is_borrowed = db.session.query(Borrow).filter(
            Borrow.item_id == item.id,
            Borrow.return_date == None
        ).first() is not None
        
        if is_borrowed:
            return jsonify(success=False, error=f"Impossible de supprimer l'article '{item.name}' car il est actuellement emprunté."), 400
        
        item_name = item.name # Sauvegarder le nom avant la suppression
        db.session.delete(item)
        db.session.commit()
        return jsonify(success=True, message=f"Article '{item_name}' supprimé avec succès.")

    except SQLAlchemyError as e: # Être plus spécifique sur l'exception si possible
        db.session.rollback()
        # Log l'erreur pour le débogage côté serveur
        # current_app.logger.error(f"SQLAlchemyError lors de la suppression de l'article {item_id}: {str(e)}")
        return jsonify(success=False, error="Erreur de base de données lors de la suppression."), 500
    except Exception as e:
        db.session.rollback()
        # Log l'erreur pour le débogage côté serveur
        # current_app.logger.error(f"Erreur générique lors de la suppression de l'article {item_id}: {str(e)}")
        return jsonify(success=False, error=f"Une erreur est survenue: {str(e)}"), 500

@admin_bp.route('/items/delete-unborrowed-temporary', methods=['POST'])
def delete_unborrowed_temporary_items():
    try:
        # Lister les IDs des articles actuellement empruntés
        borrowed_item_ids = db.session.query(Borrow.item_id).filter(Borrow.return_date == None).distinct().all()
        borrowed_item_ids = [item_id for (item_id,) in borrowed_item_ids]

        # Sélectionner les articles temporaires qui ne sont PAS dans la liste des empruntés
        items_to_delete = db.session.query(Item).filter(
            Item.is_temporary == True,
            ~Item.id.in_(borrowed_item_ids) # Le tilde ~ signifie NOT IN
        ).all()
        
        count_deleted = len(items_to_delete)

        if not items_to_delete:
            return jsonify(success=True, message="Aucun article temporaire non emprunté à supprimer.", count=0)

        for item in items_to_delete:
            db.session.delete(item)
        
        db.session.commit()
        return jsonify(success=True, message=f"{count_deleted} article(s) temporaire(s) non emprunté(s) ont été supprimé(s).", count=count_deleted)

    except SQLAlchemyError as e:
        db.session.rollback()
        # current_app.logger.error(f"SQLAlchemyError lors de la suppression des articles temporaires: {str(e)}")
        return jsonify(success=False, error="Erreur de base de données lors de la suppression des articles temporaires."), 500
    except Exception as e:
        db.session.rollback()
        # current_app.logger.error(f"Erreur générique lors de la suppression des articles temporaires: {str(e)}")
        return jsonify(success=False, error=f"Une erreur est survenue: {str(e)}"), 500

# Gestion des emplacements
@admin_bp.route('/locations')
def location_admin():
    """
    Page d'administration des emplacements
    """
    zones = db.session.query(Zone).order_by(Zone.name).all()
    furnitures = db.session.query(Furniture).order_by(Furniture.name).all()
    drawers = db.session.query(Drawer).order_by(Drawer.name).all()
    return render_template('admin/location.html', zones=zones, furnitures=furnitures, drawers=drawers)

# Reconnaissance vocale d'inventaire
@admin_bp.route('/inventory-voice')
def inventory_voice_admin():
    """
    Page d'administration pour la reconnaissance vocale d'inventaire
    """
    return render_template('admin/inventory_voice.html')
