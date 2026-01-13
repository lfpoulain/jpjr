// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', async function() {
    appLog.log('DOM chargé, initialisation...');
    
    // Vérifier si nous sommes sur la page du dashboard
    const isDashboard = document.getElementById('borrowForm') !== null;
    if (!isDashboard) {
        appLog.log('Page autre que le dashboard, pas d\'initialisation nécessaire');
        return;
    }

    window.initDashboardUI = function() {
        const addItemModal = document.getElementById('addItemModal');
        if (addItemModal) {
            addItemModal.addEventListener('hidden.bs.modal', function() {
                $('#itemName').val('');
                $('#itemZone').val('').prop('disabled', false);
                $('#itemFurniture').val('').prop('disabled', true);
                $('#itemDrawer').val('').prop('disabled', true);
                $('.suggestions-list').empty().addClass('d-none');
            });
        }

        const saveTempItemBtn = document.getElementById('saveTempItem');
        const tempItemNameInput = document.getElementById('tempItemName');
        const tempItemModalEl = document.getElementById('addTempItemModal');
        if (saveTempItemBtn && tempItemNameInput && tempItemModalEl) {
            if (!saveTempItemBtn.dataset.bound) {
                saveTempItemBtn.dataset.bound = 'true';
                saveTempItemBtn.addEventListener('click', function() {
                    const tempItemName = tempItemNameInput.value.trim();
                    if (!tempItemName) {
                        notificationManager.error('Veuillez saisir un nom d\'article.');
                        return;
                    }

                    if (typeof window.addTemporaryItem === 'function') {
                        window.addTemporaryItem(tempItemName);
                    }

                    tempItemNameInput.value = '';
                    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                        const modal = bootstrap.Modal.getOrCreateInstance(tempItemModalEl);
                        modal.hide();
                    }
                });
            }
        }
    }
    
    appLog.log('Page dashboard détectée, initialisation...');
    
    // Variables globales pour stocker les articles
    let allItems = [];
    let tempItems = [];
    
    // Initialiser le datepicker avec la localisation française
    if (flatpickr) {
        try {
            flatpickr.localize(flatpickr.l10ns.fr);
            flatpickr("#return_date", {
                dateFormat: "d/m/Y",
                minDate: "today"
            });
        } catch (e) {
            appLog.error("Erreur d'initialisation de flatpickr:", e);
        }
    }
    
    // Charger la liste complète des articles conventionnels
    async function loadItems() {
        try {
            const response = await fetch('/api/items');
            if (!response.ok) throw new Error('Erreur lors du chargement des articles conventionnels');
            
            const data = await response.json();
            allItems = Array.isArray(data) ? data : data.items || [];
            appLog.log('Articles disponibles:', allItems);
            
            return allItems;
        } catch (error) {
            appLog.error('Erreur lors du chargement des articles:', error);
            return [];
        }
    }
    
    // Charger la liste des articles temporaires
    async function loadTempItems() {
        try {
            const response = await fetch('/api/items?is_temporary=true');
            if (!response.ok) throw new Error('Erreur lors du chargement des articles temporaires');
            
            const data = await response.json();
            tempItems = Array.isArray(data) ? data : data.items || [];
            appLog.log('Articles temporaires disponibles:', tempItems);
            
            return tempItems;
        } catch (error) {
            appLog.error('Erreur lors du chargement des articles temporaires:', error);
            return [];
        }
    }
    
    // Fonction pour charger les emprunts
    async function loadBorrows() {
        try {
            appLog.log('Chargement des emprunts...');
            const response = await fetch('/api/loans?active_only=true');
            if (!response.ok) {
                throw new Error('Erreur lors du chargement des emprunts');
            }
            
            const loans = await response.json();
            appLog.log('Emprunts chargés:', loans);
            
            const borrowsList = document.getElementById('borrowsList');
            if (!borrowsList) {
                appLog.log('Liste des emprunts non trouvée dans le DOM');
                return;
            }
            
            if (loans.length === 0) {
                borrowsList.innerHTML = '<p class="text-muted">Aucun emprunt en cours</p>';
                return;
            }
            
            // Utiliser le template avec les nouvelles informations de localisation
            borrowsList.innerHTML = '';
            const template = document.getElementById('borrowTemplate');
            
            loans.forEach(loan => {
                const clone = template.content.cloneNode(true);
                
                // Remplir les données de base
                clone.querySelector('.borrow-item').dataset.borrowId = loan.id;
                clone.querySelector('h5').textContent = loan.item_name;
                clone.querySelector('.borrow-date').textContent = loan.borrow_date;
                clone.querySelector('.return-date').textContent = loan.expected_return_date;
                
                // Gestionnaire d'événement pour le bouton de retour
                const returnButton = clone.querySelector('.return-item');
                returnButton.addEventListener('click', function() {
                    handleReturn(loan.id, this);
                });
                
                // Informations de localisation (si disponibles)
                const locationInfo = clone.querySelector('.location-info');
                
                // Vérifier si c'est un article temporaire
                if (loan.is_temporary) {
                    // Pour les articles temporaires, afficher un badge simple
                    locationInfo.classList.remove('d-none');
                    locationInfo.innerHTML = '<span class="badge bg-secondary">Article temporaire</span>';
                } else if (loan.item_zone || loan.item_mobilier || loan.item_niveau_tiroir) {
                    // Pour les articles conventionnels, afficher les informations de localisation
                    locationInfo.classList.remove('d-none');
                    
                    let locationsHtml = '<p class="mb-0"><strong>Localisation:</strong></p><ul class="list-unstyled ps-3 mb-0">';
                    
                    if (loan.item_zone) {
                        locationsHtml += `<li>Zone: <span>${loan.item_zone}</span></li>`;
                    }
                    
                    if (loan.item_mobilier) {
                        locationsHtml += `<li>Mobilier: <span>${loan.item_mobilier}</span></li>`;
                    }
                    
                    if (loan.item_niveau_tiroir) {
                        locationsHtml += `<li>Niveau/Tiroir: <span>${loan.item_niveau_tiroir}</span></li>`;
                    }
                    
                    locationsHtml += '</ul>';
                    locationInfo.innerHTML = locationsHtml;
                }
                
                borrowsList.appendChild(clone);
            });
        } catch (error) {
            appLog.error('Erreur lors du chargement des emprunts:', error);
            notificationManager.error(error.message || 'Erreur lors du chargement des emprunts');
        }
    }
    
    // Fonction pour gérer l'ajout d'articles à la liste d'emprunt
    function processAddItem(itemData, name) {
        // Vérifier si l'article est déjà dans la liste
        const existingItems = document.querySelectorAll('.item-entry');
        for (let i = 0; i < existingItems.length; i++) {
            const existingName = existingItems[i].querySelector('.item-name').textContent;
            if (existingName.toLowerCase() === name.toLowerCase()) {
                appLog.log('Article déjà dans la liste:', name);
                notificationManager.warning(`L'article "${name}" est déjà dans votre liste d'emprunt`);
                return; // Sortir de la fonction sans ajouter l'article
            }
        }
        
        // Si c'est le premier article, vider le message "Aucun article sélectionné"
        const itemsQueue = document.getElementById('itemsQueue');
        if (itemsQueue && itemsQueue.querySelector('p.text-center.text-muted')) {
            itemsQueue.innerHTML = '';
        }
        
        // Cloner le template d'article
        const template = document.getElementById('itemTemplate');
        const clone = document.importNode(template.content, true);
        
        // Remplir les informations de l'article
        const itemName = clone.querySelector('.item-name');
        const itemLocation = clone.querySelector('.item-location');
        const itemIdInput = clone.querySelector('.item-id-input');
        const itemTypeInput = clone.querySelector('.item-type-input');
        
        itemName.textContent = name;
        
        // Déterminer le type d'article en fonction des données reçues
        const isTemporary = itemData && typeof itemData.is_temporary === 'boolean' ? itemData.is_temporary : false; // Default to false if not specified, rely on itemData
        
        if (isTemporary) {
            // C'est un article temporaire
            itemLocation.textContent = 'Article temporaire';
            itemIdInput.value = itemData ? itemData.id : '';
            itemTypeInput.value = 'temp';
        } else {
            // C'est un article conventionnel
            const zone = itemData && itemData.zone ? itemData.zone : $('#itemZone').val().trim();
            const mobilier = itemData && itemData.mobilier ? itemData.mobilier : $('#itemFurniture').val().trim();
            const niveauTiroir = itemData && itemData.niveau_tiroir ? itemData.niveau_tiroir : $('#itemDrawer').val().trim();
            
            // Remplir la localisation
            if (itemData && (itemData.zone_name || itemData.furniture_name || itemData.drawer_name)) {
                // Priorité 1: Utiliser les noms de zone/mobilier/tiroir s'ils existent (typiquement de /api/items/add ou /api/items/{id})
                const locationParts = [];
                if (itemData.zone_name) locationParts.push(`Zone: ${itemData.zone_name}`);
                if (itemData.furniture_name) locationParts.push(`Mobilier: ${itemData.furniture_name}`);
                if (itemData.drawer_name) locationParts.push(`Tiroir: ${itemData.drawer_name}`);
                
                itemLocation.textContent = locationParts.join(' | ') || 'Emplacement non spécifié'; // Assurer qu'on ne met pas une chaîne vide si les parts sont vides
            } else if (itemData && itemData.location_info && typeof itemData.location_info === 'string' && itemData.location_info.trim() !== '') {
                // Priorité 2: Utiliser location_info si les noms ne sont pas là (typiquement de /api/items list)
                // et que location_info n'est pas la chaîne placeholder des articles temporaires (sécurité, bien que nous soyons dans le bloc "conventionnel")
                if (itemData.location_info !== 'Article temporaire (sans emplacement)') {
                     itemLocation.textContent = itemData.location_info;
                } else {
                     // Si c'est la chaîne placeholder, alors c'est non spécifié pour un article conventionnel
                     itemLocation.textContent = 'Emplacement non spécifié';
                }
            } else {
                // Fallback final
                itemLocation.textContent = 'Emplacement non spécifié'; 
            }
            
            // Définir l'ID et le type pour le formulaire
            itemIdInput.name = `item_ids[]`;
            itemIdInput.value = itemData && itemData.id ? itemData.id : '';
            itemTypeInput.name = `item_types[]`;
            itemTypeInput.value = isTemporary ? 'temporary' : 'regular';
        }
        
        // Ajouter le bouton de suppression
        const removeBtn = clone.querySelector('.remove-item');
        removeBtn.addEventListener('click', function() {
            this.closest('.item-entry').remove();
            
            // Vérifier s'il reste des articles, sinon afficher le message "Aucun article sélectionné"
            const itemsQueue = document.getElementById('itemsQueue');
            if (itemsQueue && !itemsQueue.querySelector('.item-entry')) {
                itemsQueue.innerHTML = '<p class="text-center text-muted">Aucun article sélectionné</p>';
            }
        });
        
        // Ajouter l'article à la liste (maintenant itemsQueue au lieu de itemsList)
        document.getElementById('itemsQueue').appendChild(clone);
        $('#addItemForm')[0].reset();
        $('#locationFields').show();
        
        // Afficher un message de confirmation
        notificationManager.show(`Article "${name}" ajouté à la liste d'emprunt`, 'success');
    }

    // Fonction pour gérer le retour d'un article
    async function handleReturn(borrowId, button) {
        // Si le bouton est déjà en mode confirmation, procéder au retour
        if (button.classList.contains('confirming')) {
            try {
                // Désactiver le bouton pendant le traitement
                button.disabled = true;
                
                const response = await fetch(`/api/loans/${borrowId}/return`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Erreur lors du retour de l\'article');
                }
                
                // Recharger la liste des emprunts
                await loadBorrows();
                notificationManager.show('Article retourné avec succès', 'success');
            } catch (error) {
                appLog.error('Erreur lors du retour de l\'article:', error);
                notificationManager.show(error.message, 'danger');
                
                // Réactiver le bouton en cas d'erreur
                button.disabled = false;
                button.classList.remove('confirming');
            }
        } else {
            // Mettre le bouton en mode confirmation
            button.classList.add('confirming');
            button.textContent = 'Confirmer le retour';
            
            // Annuler la confirmation après 3 secondes
            setTimeout(() => {
                if (button && button.classList.contains('confirming')) {
                    button.classList.remove('confirming');
                    button.textContent = 'Retourner';
                }
            }, 3000);
        }
    }
    
    
    // Initialisation des gestionnaires d'événements une fois que tout est chargé
    async function init() {
        // Charger les articles
        await loadItems();
        await loadTempItems();
        
        // Charger les zones, meubles et tiroirs
        await loadZones();
        
        // Initialiser les sélecteurs de localisation
        initLocationSelectors();
        
        // Initialiser l'état de l'interrupteur
        if ($('#isTemporary').is(':checked')) {
            $('#locationFields').hide();
            $('#itemZone, #itemFurniture, #itemDrawer').prop('required', false);
        } else {
            $('#locationFields').show();
            $('#itemZone, #itemFurniture, #itemDrawer').prop('required', true);
        }
        
        // Gérer l'affichage des champs de localisation selon si l'article est temporaire ou non
        $('#isTemporary').on('change', function() {
            if ($(this).is(':checked')) {
                $('#locationFields').hide();
                $('#itemZone, #itemFurniture, #itemDrawer').prop('required', false);
            } else {
                $('#locationFields').show();
                $('#itemZone, #itemFurniture, #itemDrawer').prop('required', true);
            }
        });
        
        // Autocomplete pour le nom de l'article
        $('#itemName').on('input', function() {
            const inputValue = $(this).val().trim().toLowerCase();
            const suggestionsContainer = $(this).closest('.item-search-container').find('.suggestions-list');
            
            if (inputValue.length < 2) {
                suggestionsContainer.addClass('d-none').empty();
                return;
            }
            
            // Filtrer les articles correspondants
            const filteredItems = allItems.filter(item => !item.is_temporary && item.name.toLowerCase().includes(inputValue));
            
            if (filteredItems.length > 0) {
                suggestionsContainer.removeClass('d-none').empty();
                
                filteredItems.forEach(item => {
                    const suggestionItem = $('<div class="suggestion-item"></div>');
                    
                    const regex = new RegExp(`(${inputValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
                    const highlightedName = item.name.replace(regex, '<strong>$1</strong>');
                    
                    let locationText = '';
                    if (item.is_temporary) {
                        locationText = '<small class="text-muted d-block">Article temporaire</small>';
                    } else if (item.location && (item.location.zone_name || item.location.furniture_name || item.location.drawer_name)) {
                        const parts = [];
                        if (item.location.zone_name) parts.push(`Zone: ${item.location.zone_name}`);
                        if (item.location.furniture_name) parts.push(`Meuble: ${item.location.furniture_name}`);
                        if (item.location.drawer_name) parts.push(`Tiroir: ${item.location.drawer_name}`);
                        locationText = `<small class="text-muted d-block">${parts.join(' | ')}</small>`;
                    } else if (item.zone_name || item.furniture_name || item.drawer_name) { // Fallback if not nested
                        const parts = [];
                        if (item.zone_name) parts.push(`Zone: ${item.zone_name}`);
                        if (item.furniture_name) parts.push(`Meuble: ${item.furniture_name}`);
                        if (item.drawer_name) parts.push(`Tiroir: ${item.drawer_name}`);
                        locationText = `<small class="text-muted d-block">${parts.join(' | ')}</small>`;
                    }

                    suggestionItem.html(`
                        <div class="suggestion-item-name">${highlightedName}</div>
                        ${locationText}
                    `);

                    suggestionItem.on('click', function() {
                        $('#itemName').val(item.name);
                        suggestionsContainer.addClass('d-none').empty();
                        
                        $('#isTemporary').prop('checked', item.is_temporary === true).trigger('change');

                        if (!item.is_temporary && item.zone_id) {
                            $('#itemZone').val(item.zone_id);
                            $('#itemZone').prop('disabled', true);
                            $('#itemFurniture').prop('disabled', true);
                            $('#itemDrawer').prop('disabled', true);
                            
                            $.ajax({
                                url: `/api/location/furniture?zone_id=${item.zone_id}`,
                                method: 'GET',
                                success: function(furniture) {
                                    const furnitureSelect = $('#itemFurniture');
                                    furnitureSelect.empty().append('<option value="">Sélectionnez un meuble</option>');
                                    $.each(furniture, function(i, f) {
                                        furnitureSelect.append(`<option value="${f.id}" ${f.id == item.furniture_id ? 'selected' : ''}>${f.name}</option>`);
                                    });
                                    if (item.furniture_id) {
                                        $.ajax({
                                            url: `/api/location/drawers?furniture_id=${item.furniture_id}`,
                                            method: 'GET',
                                            success: function(drawers) {
                                                const drawerSelect = $('#itemDrawer');
                                                drawerSelect.empty().append('<option value="">Sélectionnez un tiroir/niveau</option>');
                                                $.each(drawers, function(i, d) {
                                                    drawerSelect.append(`<option value="${d.id}" ${d.id == item.drawer_id ? 'selected' : ''}>${d.name}</option>`);
                                                });
                                            },
                                            error: function(error) { appLog.error('Erreur chargement tiroirs:', error); }
                                        });
                                    }
                                },
                                error: function(error) { appLog.error('Erreur chargement meubles:', error); }
                            });
                        }
                    });
                    suggestionsContainer.append(suggestionItem);
                });
            } else {
                suggestionsContainer.addClass('d-none').empty();
            }
        });
        
        // Cacher les suggestions quand on clique ailleurs
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.item-search-container').length) {
                $('.suggestions-list').addClass('d-none').empty();
            }
        });
        
        // Ajouter un article à la liste des articles à emprunter
        $('#saveItem').on('click', function() {
            const $saveButton = $(this);
            $saveButton.prop('disabled', true); // Désactiver le bouton

            const name = $('#itemName').val().trim();
            appLog.log('Tentative d\'ajout d\'article conventionnel via addItemModal:', { name });

            if (!name) {
                notificationManager.warning('Le nom de l\'article est requis');
                $saveButton.prop('disabled', false); // Réactiver le bouton
                return;
            }

            const zoneId = $('#itemZone').val();
            const furnitureId = $('#itemFurniture').val();
            const drawerId = $('#itemDrawer').val();

            appLog.log('Informations de localisation pour nouvel article conventionnel:', {
                zoneId, furnitureId, drawerId
            });

            if (!zoneId || !furnitureId || !drawerId) {
                notificationManager.warning('Les informations de localisation (zone, mobilier, tiroir) sont obligatoires pour un article conventionnel.');
                $saveButton.prop('disabled', false); // Réactiver le bouton
                return;
            }

            const selectedItemsInQueue = document.querySelectorAll('#itemsQueue .item-name');
            let isDuplicateInQueue = false;
            selectedItemsInQueue.forEach(itemElement => {
                if (itemElement.textContent.toLowerCase() === name.toLowerCase()) {
                    isDuplicateInQueue = true;
                }
            });

            if (isDuplicateInQueue) {
                notificationManager.warning(`L'article "${name}" est déjà dans votre liste d'emprunt.`);
                $saveButton.prop('disabled', false); // Réactiver le bouton
                return;
            }

            const existingItemInAllItems = allItems.find(item =>
                item.name.toLowerCase() === name.toLowerCase() &&
                !item.is_temporary
            );

            // Fonction helper pour l'appel AJAX de création/utilisation d'article conventionnel
            function createOrUseConventionalItemAPI(itemName, itemZoneId, itemFurnitureId, itemDrawerId) {
                $.ajax({
                    url: '/api/items/add',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        name: itemName,
                        zone_id: itemZoneId,
                        furniture_id: itemFurnitureId,
                        drawer_id: itemDrawerId,
                        is_temporary: false
                    }),
                    success: function(data) {
                        if (data.item) {
                            appLog.log('Réponse API succès pour ajout/utilisation article conventionnel:', data.item);
                            if (!allItems.find(i => i.id === data.item.id)) {
                                allItems.push(data.item);
                            }
                            processAddItem(data.item, itemName);
                            $('#addItemModal').modal('hide');
                        } else if (data.error && data.item) { // Cas spécifique du 409 où le backend renvoie l'item existant
                            notificationManager.warning(data.error);
                            appLog.warn('Conflit détecté par le backend (409 avec item):', data.error, data.item);
                            processAddItem(data.item, itemName);
                            $('#addItemModal').modal('hide');
                        } else {
                            notificationManager.error(data.error || 'Erreur lors de la création/utilisation de l\'article.');
                            appLog.error('Erreur API (sans item dans succès):', data);
                        }
                    },
                    error: function(jqXHR) {
                        const response = jqXHR.responseJSON || {};
                        const errorMsg = response.error || 'Impossible de créer ou d\'utiliser l\'article.';
                        const conflictItem = response.item;

                        notificationManager.error('Erreur: ' + errorMsg);
                        appLog.error('Erreur AJAX pour création/utilisation article:', errorMsg, conflictItem, jqXHR);

                        if (jqXHR.status === 409 && conflictItem) {
                            appLog.log('Conflit 409 du backend, utilisation de l\'article existant fourni:', conflictItem);
                            processAddItem(conflictItem, conflictItem.name);
                            $('#addItemModal').modal('hide');
                        }
                    },
                    complete: function() {
                        $saveButton.prop('disabled', false); // Réactiver le bouton dans tous les cas
                    }
                });
            }

            if (existingItemInAllItems) {
                let useThisExistingItem = false;
                if (parseInt(zoneId) === existingItemInAllItems.zone_id &&
                    parseInt(furnitureId) === existingItemInAllItems.furniture_id &&
                    parseInt(drawerId) === existingItemInAllItems.drawer_id) {
                    useThisExistingItem = true;
                }

                if (useThisExistingItem) {
                    appLog.log('Article conventionnel existant (même nom et emplacement) trouvé dans allItems, ajout à la liste d\'emprunt:', existingItemInAllItems);
                    processAddItem(existingItemInAllItems, name);
                    $('#addItemModal').modal('hide');
                    $saveButton.prop('disabled', false); // Réactiver le bouton
                } else {
                    appLog.log('Nom d\'article existant dans allItems mais emplacement différent ou entré manuellement. Tentative de création/utilisation via API.');
                    createOrUseConventionalItemAPI(name, zoneId, furnitureId, drawerId);
                }
            } else {
                appLog.log('Article conventionnel non trouvé dans allItems. Tentative de création via API.');
                createOrUseConventionalItemAPI(name, zoneId, furnitureId, drawerId);
            }
        });
        
        // Soumettre le formulaire d'emprunt - d'abord supprimer tous les gestionnaires existants
        $('#borrowForm').off('submit').on('submit', function(e) {
            e.preventDefault();
            appLog.log('Soumission du formulaire d\'emprunt');
            
            const items = [];
            // Collecte unique des articles pour éviter les doublons
            const uniqueItems = new Map();
            
            $('.item-entry').each(function() {
                const id = $(this).find('.item-id-input').val();
                const type = $(this).find('.item-type-input').val();
                const name = $(this).find('.item-name').text();
                
                // Utiliser le nom comme clé pour éviter les doublons
                if (!uniqueItems.has(name)) {
                    uniqueItems.set(name, {
                        id: id,
                        type: type,
                        name: name
                    });
                }
            });
            
            // Convertir Map en tableau
            uniqueItems.forEach(item => items.push(item));
            
            if (items.length === 0) {
                notificationManager.warning('Veuillez ajouter au moins un article');
                return;
            }
            
            const returnDate = $('#return_date').val();
            if (!returnDate) {
                notificationManager.warning('Veuillez sélectionner une date de retour');
                return;
            }
            
            // Envoyer la demande d'emprunt
            $.ajax({
                url: '/api/loans/create',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    items: items,
                    return_date: returnDate
                }),
                success: function(data) {
                    // Réinitialiser le formulaire
                    $('#borrowForm')[0].reset();
                    
                    // Supprimer tous les articles de la liste d'emprunt
                    $('#itemsQueue').empty();
                    // Afficher message "Aucun article sélectionné"
                    $('#itemsQueue').html('<p class="text-center text-muted">Aucun article sélectionné</p>');
                    
                    // Analyser les résultats de l'emprunt
                    if (data.success) {
                        // Compter les emprunts réussis et échoués
                        const successCount = data.loans.filter(loan => loan.status === 'success').length;
                        const errorCount = data.loans.filter(loan => loan.status === 'error').length;
                        
                        if (errorCount === 0) {
                            notificationManager.show(`${successCount} article(s) emprunté(s) avec succès`, 'success');
                            // Rediriger vers la page "Mes emprunts" après un court délai
                            setTimeout(function() {
                                window.location.href = '/my-borrows';
                            }, 1000);
                        } else if (successCount === 0) {
                            notificationManager.show(`Aucun article emprunté. ${errorCount} article(s) déjà emprunté(s)`, 'warning');
                        } else {
                            notificationManager.show(`${successCount} article(s) emprunté(s) avec succès. ${errorCount} article(s) n'ont pas pu être empruntés`, 'info');
                            // Rediriger vers la page "Mes emprunts" après un court délai
                            setTimeout(function() {
                                window.location.href = '/my-borrows';
                            }, 1000);
                        }
                        
                        // Afficher les détails des erreurs si nécessaire
                        data.loans.filter(loan => loan.status === 'error').forEach(errorLoan => {
                            notificationManager.show(`Article "${errorLoan.item_name}": ${errorLoan.error}`, 'warning');
                        });
                    } else {
                        notificationManager.show('Aucun article n\'a pu être emprunté', 'danger');
                    }
                },
                error: function(error) {
                    notificationManager.show('Erreur: ' + (error.responseJSON?.error || 'Impossible d\'enregistrer l\'emprunt'), 'danger');
                }
            });
        });
    }
    
    // Fonction pour ajouter un article temporaire via la reconnaissance vocale
    window.addTemporaryItem = function(itemName) {
        if (!itemName || typeof itemName !== 'string' || itemName.trim() === '') {
            appLog.error('Nom d\'article invalide pour addTemporaryItem:', itemName);
            return false;
        }
        
        // Mettre une majuscule à la première lettre
        itemName = itemName.trim();
        itemName = itemName.charAt(0).toUpperCase() + itemName.slice(1);
        appLog.log('Ajout d\'un article temporaire via reconnaissance vocale:', itemName);
        
        // Appel API pour créer l'article temporaire via la route unifiée
        $.ajax({
            url: '/api/items/add',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ name: itemName, is_temporary: true }),
            success: function(data) {
                processAddItem(data.item, itemName);
            },
            error: function(error) {
                appLog.error('Erreur lors de l\'ajout de l\'article temporaire:', error);
                notificationManager.show('Erreur: ' + (error.responseJSON?.error || `Impossible d'ajouter l'article temporaire "${itemName}"`), 'danger');
            }
        });
        
        return true;
    };
    
    // Fonction pour ajouter un article conventionnel via la reconnaissance vocale
    window.addConventionalItem = function(itemData) {
        if (!itemData || !itemData.name || typeof itemData.name !== 'string' || itemData.name.trim() === '') {
            appLog.error('Données d\'article invalides pour addConventionalItem:', itemData);
            return false;
        }
        
        // Mettre une majuscule à la première lettre
        const itemName = itemData.name.trim();
        itemData.name = itemName.charAt(0).toUpperCase() + itemName.slice(1);
        appLog.log('Ajout d\'un article conventionnel via reconnaissance vocale:', itemData);
        
        // Si l'article a un ID de base de données, on l'utilise directement
        if (itemData.db_id) {
            // Récupérer les détails de l'article depuis la base de données
            $.ajax({
                url: `/api/items/${itemData.db_id}`,
                method: 'GET',
                success: function(data) {
                    // Utiliser les données complètes de l'article pour l'ajouter à la liste
                    processAddItem(data.item, itemData.name);
                },
                error: function(error) {
                    appLog.error('Erreur lors de la récupération de l\'article conventionnel:', error);
                    // En cas d'erreur, utiliser les données partielles que nous avons
                    const partialItemData = {
                        id: itemData.db_id,
                        name: itemData.name,
                        is_temporary: false
                    };
                    
                    // Ajouter les informations d'emplacement si disponibles
                    if (itemData.zone_id) partialItemData.zone_id = itemData.zone_id;
                    if (itemData.furniture_id) partialItemData.furniture_id = itemData.furniture_id;
                    if (itemData.drawer_id) partialItemData.drawer_id = itemData.drawer_id;
                    if (itemData.location_info) partialItemData.location_info = itemData.location_info;
                    
                    processAddItem(partialItemData, itemData.name);
                    notificationManager.warning(`Informations partielles pour l'article "${itemData.name}"`);
                }
            });
        } else {
            // Si nous n'avons pas d'ID, traiter comme un article temporaire
            appLog.log('Article conventionnel sans ID, traitement comme article temporaire:', itemData.name);
            addTemporaryItem(itemData.name);
        }
        
        return true;
    };
    
    // Initialisation
    appLog.log('Initialisation des gestionnaires d\'événements...');
    init();
    
    appLog.log('Initialisation terminée');
});
