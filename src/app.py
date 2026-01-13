from flask import Flask, redirect, url_for, request
import os
from dotenv import load_dotenv

# Ajouter le répertoire parent au chemin de recherche pour les importations
from config.database import get_connection_string
from config.logging_config import setup_logging
from src.models import db 
from src.routes import blueprints 


# Load environment variables
load_dotenv()

# Ensure data directory exists
# os.makedirs('/data/database', exist_ok=True)  # No longer needed for PostgreSQL

# Configuration de l'application
app = Flask(__name__, 
    static_folder='static',  # Dossier pour les fichiers statiques
    static_url_path='/static'  # URL pour accéder aux fichiers statiques
)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-replace-in-production')
app.config['DEBUG'] = os.getenv('FLASK_DEBUG') == '1'
app.config['SQLALCHEMY_DATABASE_URI'] = get_connection_string()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db.init_app(app)

# Rendre le mode debug accessible dans les templates
@app.context_processor
def inject_debug_mode():
    return dict(FLASK_DEBUG_MODE=app.debug)

# Enregistrer les blueprints
for blueprint in blueprints:
    if blueprint.name == 'reports': # Gérer l'url_prefix spécifique pour reports_bp
        app.register_blueprint(blueprint, url_prefix='/reports')
    else: # Pour tous les autres blueprints, y compris ai_bp (qui a son propre url_prefix)
        app.register_blueprint(blueprint)

# Ces routes ont été migrées vers main_routes.py et admin_routes.py
# Pour assurer la compatibilité avec les anciens liens, nous gardons temporairement des redirections

# Redirection vers la nouvelle route d'accueil
@app.route('/')
def index_redirect():
    return redirect(url_for('main.index'))

# Redirection vers la nouvelle route d'administration
@app.route('/admin')
def admin_redirect():
    return redirect(url_for('admin.admin_dashboard'))

# Redirection vers la nouvelle route de liste des utilisateurs
@app.route('/user_list')
def user_list_redirect():
    return redirect(url_for('admin.user_list'))

# Redirection vers la nouvelle route de liste des articles
@app.route('/items_list')
def items_list_redirect():
    return redirect(url_for('admin.items_list'))

# Cette route a été migrée vers reports_routes.py
@app.route('/export_items_csv')
def export_items_csv_redirect():
    return redirect(url_for('reports.export_items_csv'))

# Ces routes ont été migrées vers main_routes.py

@app.route('/login', methods=['POST'])
def login_redirect():
    return redirect(url_for('main.login'))

@app.route('/login/<int:user_id>')
def login_existing_redirect(user_id):
    return redirect(url_for('main.login_with_id', user_id=user_id))

@app.route('/dashboard')
def dashboard_redirect():
    return redirect(url_for('main.dashboard'))

# Cette route a été migrée vers main_routes.py
@app.route('/logout')
def logout_redirect():
    return redirect(url_for('main.logout'))

# Ces routes ont été migrées vers loans_api.py
@app.route('/api/loans/create', methods=['POST'])
def api_create_loan_redirect():
    return redirect(url_for('loans_api.create_loan'))

@app.route('/api/loans/<int:loan_id>/return', methods=['POST'])
def api_return_loan_redirect(loan_id):
    return redirect(url_for('loans_api.return_loan', loan_id=loan_id))

@app.route('/api/loans', methods=['GET'])
def api_get_loans_redirect():
    return redirect(url_for('loans_api.get_loans'))

@app.route('/api/items', methods=['GET'])
def api_items_redirect():
    """
    Redirige vers la route /api/items dans le blueprint items_api
    """
    return redirect(url_for('items_api.get_items'))

@app.route('/api/items/<int:item_id>', methods=['GET'])
def api_get_item_redirect(item_id):
    """
    Redirige vers la route /api/items/<int:item_id> dans le blueprint items_api
    """
    return redirect(url_for('items_api.get_item', item_id=item_id))

@app.route('/api/add-item', methods=['POST'])
def api_add_item_redirect():
    """
    Redirige vers la route /api/add-item dans le blueprint items_api
    """
    return redirect(url_for('items_api.add_item'))

@app.route('/autocomplete', methods=['GET'])
def autocomplete_redirect():
    """
    Redirige vers la route /autocomplete dans le blueprint utils_routes
    """
    return redirect(url_for('utils.autocomplete', **request.args))

@app.route('/generate_pdf', methods=['POST'])
def generate_pdf_redirect():
    """
    Redirige vers la route /generate_pdf dans le blueprint reports_routes
    """
    # Transférer tous les arguments de formulaire à la nouvelle route
    return redirect(url_for('reports.generate_pdf', **request.form))

@app.route('/admin/db-config', methods=['GET', 'POST'])
def db_config_redirect():
    """
    Redirige vers la route /admin/db-config dans le blueprint admin_routes
    """
    if request.method == 'POST':
        return redirect(url_for('admin.db_config', **request.form))
    else:
        return redirect(url_for('admin.db_config'))


def init_db():
    with app.app_context():
        db.create_all()

if __name__ == '__main__':
    # Configure logging
    setup_logging(app)
    init_db()
    use_ssl = os.environ.get("USE_SSL", "true").lower() != "false"
    if use_ssl:
        app.run(host='0.0.0.0', port=5001, ssl_context='adhoc', debug=app.debug)
    else:
        app.run(host='0.0.0.0', port=5001, debug=app.debug)
