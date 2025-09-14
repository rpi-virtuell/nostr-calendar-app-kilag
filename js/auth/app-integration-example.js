// Beispiel: Integration in app.js mit der neuen Auth-Plugin-Architektur

import { authManager } from './auth/AuthManager.js';

// DOM ready Setup
document.addEventListener('DOMContentLoaded', async () => {
  initEls();
  
  // Initialize authentication system
  await authManager.initialize();
  
  // Setup UI with auth manager
  await authManager.setupUI({
    whoami: els.whoami,
    btnLogin: els.btnLogin,
    btnLogout: els.btnLogout,
    btnNew: els.btnNew,
    btnLoginMenu: els.btnLoginMenu,
    btnManual: els.btnManual,
    btnNip07: els.btnNip07,
    btnBunker: els.btnBunker
  }, async (activePlugin) => {
    // Called whenever auth state changes
    console.log('[App] Auth state changed:', activePlugin?.name || 'none');
    await refresh(); // Refresh events when auth changes
  });

  // Event handlers using auth manager
  on(els.btnNew, 'click', async () => {
    if (!await authManager.isLoggedIn()) {
      alert('Bitte zuerst einloggen.');
      return;
    }
    openModalForNew();
  });

  on(els.btnSave, 'click', async (e) => {
    e.preventDefault();
    const data = getFormData();
    
    if (!data.title || !data.starts || !data.ends) {
      alert('Titel, Beginn und Ende sind Pflichtfelder.');
      return;
    }

    try {
      // Use auth manager to create event (automatically uses active plugin)
      const result = await authManager.createEvent(data);
      console.log('[App] Event created:', result);
      
      els.modal.close();
      await refresh();
    } catch (err) {
      console.error('[App] Event creation failed:', err);
      alert('Veröffentlichen fehlgeschlagen: ' + err.message);
    }
  });

  // Initial event load
  await refresh();
});

// Edit permission check using auth manager
async function openModalForEdit(evt) {
  try {
    const userPubkey = await authManager.getPublicKey();
    
    if (evt.pubkey && evt.pubkey !== userPubkey) {
      alert('Bearbeiten nicht möglich: Sie sind nicht der Autor dieses Termins.');
      return;
    }
    
    fillFormFromEvent(evt);
    els.btnCancelEvent.classList.remove('hidden');
    els.btnDelete.classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'Termin bearbeiten';
    els.modal.showModal();
  } catch (error) {
    console.error('Error checking edit permissions:', error);
    alert('Fehler beim Überprüfen der Berechtigung.');
  }
}

// This would also work for future auth plugins like Keycloak:
// 
// class KeycloakAuthPlugin extends AuthPluginInterface {
//   constructor(config) {
//     super(config);
//     this.name = 'keycloak';
//     this.displayName = 'Keycloak SSO';
//     this.keycloakInstance = new Keycloak(config.keycloak);
//   }
//   
//   async login() {
//     return await this.keycloakInstance.login();
//   }
//   
//   async createEvent(eventData) {
//     // Use Keycloak token to create event via server
//     return await fetch('/api/events', {
//       headers: { 'Authorization': `Bearer ${this.keycloakInstance.token}` },
//       method: 'POST',
//       body: JSON.stringify(eventData)
//     });
//   }
// }
//
// // Registration:
// authRegistry.register('keycloak', new KeycloakAuthPlugin(config));