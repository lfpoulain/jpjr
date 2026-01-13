from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify, send_file, Response, current_app
import csv
import io
import os
import tempfile
from datetime import datetime
from fpdf import FPDF
from src.models import db
from src.models.user import User
from src.models.item import Item
from src.models.borrow import Borrow

# Création du blueprint
reports_bp = Blueprint('reports', __name__)

# Export de la liste des articles en CSV
@reports_bp.route('/export_items_csv')
def export_items_csv():
    """
    Exporte la liste des articles au format CSV
    """
    if 'user_id' not in session:
        flash('Veuillez vous connecter', 'danger')
        return redirect(url_for('main.index'))
    
    # Accès ouvert à tous les utilisateurs
    # Accès autorisé pour tous les utilisateurs
    if False:
        flash('Vous n\'êtes pas autorisé à accéder à cette page', 'danger')
        return redirect(url_for('main.dashboard'))
    
    # Récupérer tous les articles
    items = db.session.query(Item).order_by(Item.name).all()
    
    # Créer un fichier CSV en mémoire
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Écrire l'en-tête
    writer.writerow(['ID', 'Nom', 'Zone', 'Meuble', 'Tiroir/Niveau', 'Temporaire'])
    
    # Écrire les lignes de données
    for item in items:
        writer.writerow([
            item.id,
            item.name,
            item.zone or '',
            item.mobilier or '',
            item.niveau_tiroir or '',
            'Oui' if item.is_temporary else 'Non'
        ])
    
    # Préparer la réponse
    output.seek(0)
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=articles_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

# Génération d'un PDF des emprunts d'un utilisateur
@reports_bp.route('/generate_pdf', methods=['POST'])
def generate_pdf():
    """
    Génère un PDF des emprunts d'un utilisateur
    """
    if 'user_id' not in session:
        flash('Veuillez vous connecter', 'danger')
        return redirect(url_for('main.index'))
    
    # Récupérer l'ID de l'utilisateur
    user_id = request.form.get('user_id')
    if not user_id:
        flash('Utilisateur requis', 'danger')
        return redirect(url_for('main.index'))
    
    user = db.session.get(User, user_id)
    if not user:
        flash('Utilisateur non trouvé', 'danger')
        return redirect(url_for('main.index'))

    # Récupérer les emprunts en cours de l'utilisateur
    current_loans = db.session.query(Borrow).filter(
        Borrow.user_id == user_id,
        Borrow.return_date == None
    ).all()
    
    # Créer un PDF avec FPDF
    pdf = FPDF()
    pdf.add_page()
    
    # Ajouter le titre
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, 'Liste des emprunts', 0, 1, 'C')
    pdf.cell(0, 10, f'Utilisateur: {user.name}', 0, 1, 'C')
    pdf.cell(0, 10, f'Date: {datetime.now().strftime("%d/%m/%Y")}', 0, 1, 'C')
    pdf.ln(10)
    
    # Vérifier s'il y a des emprunts
    if not current_loans:
        pdf.set_font('Arial', '', 12)
        pdf.cell(0, 10, 'Aucun emprunt en cours.', 0, 1)
    else:
        # Entête du tableau
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(10, 10, '#', 1, 0, 'C')
        pdf.cell(70, 10, 'Article', 1, 0, 'C')
        pdf.cell(60, 10, 'Emplacement', 1, 0, 'C')
        pdf.cell(50, 10, 'Date d\'emprunt', 1, 1, 'C')
        
        # Contenu du tableau
        pdf.set_font('Arial', '', 10)
        for i, loan in enumerate(current_loans, 1):
            item = loan.item
            
            # Numéro
            pdf.cell(10, 10, str(i), 1, 0, 'C')
            
            # Nom de l'article
            pdf.cell(70, 10, item.name, 1, 0, 'L')
            
            # Emplacement
            location = item.location_info if not item.is_temporary else 'Article temporaire'
            pdf.cell(60, 10, location, 1, 0, 'L')
            
            # Date d'emprunt
            borrow_date = loan.borrow_date.strftime('%d/%m/%Y') if loan.borrow_date else ''
            pdf.cell(50, 10, borrow_date, 1, 1, 'C')
    
    # Générer le PDF dans un fichier temporaire
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        pdf_path = tmp.name
        pdf.output(pdf_path)
    
    # Envoyer le fichier PDF au client
    try:
        response = send_file(
            pdf_path,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'emprunts_{user.name}_{datetime.now().strftime("%Y%m%d")}.pdf'
        )
        
        @response.call_on_close
        def cleanup_file():
            try:
                os.unlink(pdf_path)
            except Exception as e_clean:
                current_app.logger.error(f"Erreur lors du nettoyage du fichier PDF temporaire {pdf_path}: {e_clean}")
        
        return response
    except Exception as e:
        # En cas d'erreur, supprimer le fichier temporaire et retourner une erreur
        try:
            os.unlink(pdf_path)
        except:
            pass
        flash(f'Erreur lors de la génération du PDF: {str(e)}', 'danger')
        return redirect(url_for('main.dashboard'))

@reports_bp.route('/all_items_pdf')
def generate_all_items_pdf():
    """Génère un PDF listant tous les articles (matériel)."""
    if 'user_id' not in session: # Ajout de la vérification de session
        flash('Veuillez vous connecter pour accéder à cette fonctionnalité.', 'warning')
        return redirect(url_for('main.login')) # Ou une autre page de login appropriée
    try:
        items = Item.query.order_by(Item.name).all()

        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)

        # Titre
        pdf.set_font('Arial', 'B', 16)
        pdf.cell(0, 10, 'Liste de Tout le Matériel', 0, 1, 'C')
        pdf.set_font('Arial', '', 10)
        pdf.cell(0, 10, f'Date de génération: {datetime.now().strftime("%d/%m/%Y %H:%M:%S")}', 0, 1, 'C')
        pdf.ln(10)

        if not items:
            pdf.set_font('Arial', '', 12)
            pdf.cell(0, 10, 'Aucun article trouvé.', 0, 1)
        else:
            # En-têtes de tableau
            pdf.set_font('Arial', 'B', 10)
            header_height = 7
            col_widths = {'id': 15, 'name': 60, 'location': 70, 'type': 25, 'created_at': 25}
            
            pdf.cell(col_widths['id'], header_height, 'ID', 1, 0, 'C')
            pdf.cell(col_widths['name'], header_height, 'Nom', 1, 0, 'C')
            pdf.cell(col_widths['location'], header_height, 'Emplacement', 1, 0, 'C')
            pdf.cell(col_widths['type'], header_height, 'Type', 1, 0, 'C')
            pdf.cell(col_widths['created_at'], header_height, 'Créé le', 1, 1, 'C')

            # Données du tableau
            pdf.set_font('Arial', '', 9)
            row_height = 6
            for item in items:
                item_type = "Temporaire" if item.is_temporary else "Permanent"
                created_date = item.created_at.strftime("%d/%m/%y") if item.created_at else "N/A"
                location_text = item.location_info if item.location_info else "N/A"

                # Utilisation de cell au lieu de multi_cell pour la simplicité et la cohérence
                # Le texte long sera coupé par FPDF. Une gestion plus avancée du texte nécessiterait des calculs de largeur de texte.
                pdf.cell(col_widths['id'], row_height, str(item.id), 1, 0, 'C')
                pdf.cell(col_widths['name'], row_height, item.name, 1, 0, 'L')
                pdf.cell(col_widths['location'], row_height, location_text, 1, 0, 'L')
                pdf.cell(col_widths['type'], row_height, item_type, 1, 0, 'C')
                pdf.cell(col_widths['created_at'], row_height, created_date, 1, 1, 'C') # ln=1 pour la dernière cellule de la ligne

        # Générer le PDF dans un fichier temporaire
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            pdf_path = tmp.name
            pdf.output(pdf_path)

        # Envoyer le fichier PDF au client
        response = send_file(
            pdf_path,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'liste_materiel_{datetime.now().strftime("%Y%m%d")}.pdf'
        )
        # Nettoyage après l'envoi (nécessaire sur certains systèmes)
        @response.call_on_close
        def cleanup_file():
            try:
                os.unlink(pdf_path)
            except Exception as e_clean:
                current_app.logger.error(f"Erreur lors du nettoyage du fichier PDF temporaire {pdf_path}: {e_clean}")
        return response

    except Exception as e:
        current_app.logger.error(f'Erreur lors de la génération du PDF de tous les articles: {e}', exc_info=True)
        flash(f'Erreur lors de la génération du PDF: {str(e)}', 'danger')
        return redirect(url_for('admin.items_list')) # Rediriger vers la liste des articles en cas d'erreur)
