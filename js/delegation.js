// js/delegation.js
// UI components for NIP-26 Delegation management

import { prepareDelegation, completeDelegation, getDelegation, clearDelegation } from './nostr.js';
import { on } from './utils.js';

/**
 * Creates a delegation setup UI
 * @param {HTMLElement} container - Container element for the delegation UI
 * @param {Function} onDelegationChange - Callback when delegation status changes
 */
export function setupDelegationUI(container, onDelegationChange) {
  if (!container) return;

  const delegationStatus = getDelegation();
  
  container.innerHTML = `
    <div class="delegation-panel">
      <h3>🔐 Delegation Status</h3>
      <div class="delegation-info">
        ${delegationStatus ? 
          `<div class="delegation-active">
            <span class="status-indicator">✅</span>
            <span>Delegation aktiv für Kalender-Events</span>
            <div class="delegation-details">
              <small>Delegator: ${delegationStatus.delegatorPubkey?.slice(0,16)}...</small><br>
              <small>Bedingungen: ${delegationStatus.conditions}</small>
            </div>
            <button id="btn-clear-delegation" class="btn-secondary">Delegation löschen</button>
          </div>` :
          `<div class="delegation-inactive">
            <span class="status-indicator">❌</span>
            <span>Keine Delegation aktiv</span>
            <p><small>Eine Delegation erlaubt dem Server, Kalender-Events in Ihrem Namen zu erstellen.</small></p>
            <button id="btn-setup-delegation" class="btn-primary">Delegation einrichten</button>
          </div>`
        }
      </div>
    </div>
  `;

  // Event handlers
  const btnSetup = container.querySelector('#btn-setup-delegation');
  const btnClear = container.querySelector('#btn-clear-delegation');

  if (btnSetup) {
    on(btnSetup, 'click', async () => {
      try {
        btnSetup.disabled = true;
        btnSetup.textContent = 'Einrichten...';
        
        await setupDelegation();
        
        // Refresh UI
        setupDelegationUI(container, onDelegationChange);
        if (onDelegationChange) onDelegationChange(getDelegation());
        
      } catch (err) {
        console.error('Delegation setup failed:', err);
        alert('Fehler beim Einrichten der Delegation: ' + err.message);
        btnSetup.disabled = false;
        btnSetup.textContent = 'Delegation einrichten';
      }
    });
  }

  if (btnClear) {
    on(btnClear, 'click', () => {
      if (confirm('Möchten Sie die Delegation wirklich löschen?')) {
        clearDelegation();
        setupDelegationUI(container, onDelegationChange);
        if (onDelegationChange) onDelegationChange(null);
      }
    });
  }
}

/**
 * Setup delegation process (2-step)
 */
export async function setupDelegation(kind = 31923) {
  try {
    // Step 1: Prepare delegation
    console.log('[Delegation] Preparing delegation...');
    const prepareData = await prepareDelegation(kind);
    
    // Step 2: Ask user to sign
    console.log('[Delegation] Please sign the delegation message...');
    
    if (!window.nostr?.signEvent) {
      throw new Error('NIP-07 Signer nicht verfügbar. Bitte installieren Sie eine Nostr-Browser-Extension.');
    }

    // Show user what they're signing
    const userConfirmed = confirm(
      `Möchten Sie eine Delegation für Kalender-Events einrichten?\n\n` +
      `Dies erlaubt dem Server, Events in Ihrem Namen zu erstellen.\n\n` +
      `Delegator: ${prepareData.delegatorPubkey}\n` +
      `Delegatee: ${prepareData.delegateePubkey}\n` +
      `Bedingungen: ${prepareData.conditions}\n\n` +
      `Klicken Sie OK um die Delegation zu signieren.`
    );

    if (!userConfirmed) {
      throw new Error('Delegation vom Benutzer abgebrochen');
    }
    
    // Step 2: Sign delegation message - try different methods
    if (!window.nostr) {
      throw new Error('NIP-07 Extension nicht verfügbar. Bitte installieren Sie nos2x-fox oder ähnliche Extension.');
    }

    let signature;
    
    // Method 1: Try signSchnorr (ideal for NIP-26)
    if (typeof window.nostr.signSchnorr === 'function') {
      console.log('[Delegation] Using signSchnorr for delegation...');
      const messageBytes = new TextEncoder().encode(prepareData.delegationMessage);
      signature = await window.nostr.signSchnorr(messageBytes);
    } 
    // Method 2: Fallback - use signEvent and extract signature  
    else {
      console.log('[Delegation] signSchnorr not available, using signEvent fallback...');
      const tempEvent = {
        kind: 1,
        content: prepareData.delegationMessage,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', 'delegation-signature']],
        pubkey: await window.nostr.getPublicKey()
      };
      const signedEvent = await window.nostr.signEvent(tempEvent);
      signature = signedEvent.sig;
    }
    
    if (!signature) {
      throw new Error('Keine Signatur erhalten');
    }
    
    console.log('[Delegation] Got signature:', signature);
    
    // Step 3: Complete delegation
    console.log('[Delegation] Completing delegation...');
    const result = await completeDelegation(signature);
    
    console.log('[Delegation] Successfully setup delegation:', result);
    return result;
    
  } catch (err) {
    console.error('[Delegation] Setup failed:', err);
    throw err;
  }
}

/**
 * Check if delegation is active and valid
 */
export function isDelegationActive() {
  const delegation = getDelegation();
  if (!delegation) return false;
  
  // TODO: Check if delegation is still valid (not expired)
  return true;
}

/**
 * Get delegation summary for display
 */
export function getDelegationSummary() {
  const delegation = getDelegation();
  if (!delegation) return null;
  
  return {
    isActive: true,
    delegatorPubkey: delegation.delegatorPubkey,
    conditions: delegation.conditions,
    signature: delegation.signature
  };
}