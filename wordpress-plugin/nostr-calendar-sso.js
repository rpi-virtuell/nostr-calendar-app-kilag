/**
 * WordPress Nostr Calendar SSO JavaScript
 */
(function($) {
    'use strict';
    
    const NostrCalendarSSO = {
        
        init: function() {
            this.bindEvents();
            this.checkAutoLogin();
        },
        
        bindEvents: function() {
            // Kalender-Button Events
            $(document).on('click', '.nostr-calendar-open', this.openCalendar.bind(this));
            $(document).on('click', '.nostr-calendar-login', this.autoLogin.bind(this));
        },
        
        /**
         * Automatisches Login in Calendar App
         */
        autoLogin: function() {
            this.getToken().then(tokenData => {
                if (tokenData.success) {
                    const calendarUrl = tokenData.calendar_url + '/wp-sso?token=' + encodeURIComponent(tokenData.token);
                    window.open(calendarUrl, '_blank');
                } else {
                    alert('Fehler beim Token abrufen: ' + (tokenData.error || 'Unbekannter Fehler'));
                }
            }).catch(error => {
                console.error('SSO Error:', error);
                alert('Anmeldung fehlgeschlagen: ' + error.message);
            });
        },
        
        /**
         * Kalender in Modal/iframe öffnen
         */
        openCalendar: function() {
            this.getToken().then(tokenData => {
                if (tokenData.success) {
                    this.showCalendarModal(tokenData);
                } else {
                    alert('Fehler beim Token abrufen: ' + (tokenData.error || 'Unbekannter Fehler'));
                }
            }).catch(error => {
                console.error('Calendar Error:', error);
                alert('Kalender konnte nicht geöffnet werden: ' + error.message);
            });
        },
        
        /**
         * Token vom WordPress Backend abrufen
         */
        getToken: function() {
            return fetch(nostr_calendar_ajax.ajax_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_nostr_token&_wpnonce=' + nostr_calendar_ajax.nonce
            })
            .then(response => response.json());
        },
        
        /**
         * Kalender Modal anzeigen
         */
        showCalendarModal: function(tokenData) {
            const calendarUrl = tokenData.calendar_url + '/wp-sso?token=' + encodeURIComponent(tokenData.token);
            
            // Modal HTML erstellen
            const modalHtml = `
                <div id="nostr-calendar-modal" style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                    background: rgba(0,0,0,0.7); z-index: 999999; display: flex; 
                    justify-content: center; align-items: center;
                ">
                    <div style="
                        background: white; width: 90%; height: 90%; max-width: 1200px; 
                        border-radius: 8px; position: relative; overflow: hidden;
                    ">
                        <div style="
                            padding: 15px; border-bottom: 1px solid #ddd; 
                            display: flex; justify-content: space-between; align-items: center;
                        ">
                            <h3 style="margin: 0;">Nostr Calendar - ${tokenData.user.display_name}</h3>
                            <button id="close-calendar-modal" style="
                                background: #f44336; color: white; border: none; 
                                padding: 8px 12px; border-radius: 4px; cursor: pointer;
                            ">Schließen</button>
                        </div>
                        <iframe src="${calendarUrl}" style="
                            width: 100%; height: calc(100% - 60px); border: none;
                        "></iframe>
                    </div>
                </div>
            `;
            
            // Modal zum DOM hinzufügen
            $('body').append(modalHtml);
            
            // Close Event
            $('#close-calendar-modal, #nostr-calendar-modal').on('click', function(e) {
                if (e.target.id === 'close-calendar-modal' || e.target.id === 'nostr-calendar-modal') {
                    $('#nostr-calendar-modal').remove();
                }
            });
        },
        
        /**
         * Prüfen ob Auto-Login aktiviert werden soll
         */
        checkAutoLogin: function() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('nostr_calendar_login') === 'auto') {
                this.autoLogin();
            }
        }
    };
    
    // Initialisierung
    $(document).ready(function() {
        NostrCalendarSSO.init();
    });
    
    // Global verfügbar machen
    window.NostrCalendarSSO = NostrCalendarSSO;
    
})(jQuery);