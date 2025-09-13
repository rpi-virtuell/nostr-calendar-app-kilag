import fetch from 'node-fetch';

console.log('🧪 Testing WordPress SSO event creation...');

// Step 1: Login with WordPress SSO
const loginResponse = await fetch('http://localhost:8787/wp-login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: btoa(JSON.stringify({
      wp_user_id: 1001,
      username: 'max.mustermann',
      email: 'max@example.com',
      expires: Math.floor(Date.now() / 1000) + 3600
    })) + '.demo_signature_test'
  })
});

const loginData = await loginResponse.json();
console.log('🔐 Login response:', loginData);

const cookies = loginResponse.headers.raw()['set-cookie'];
const sessionCookie = cookies?.find(c => c.startsWith('connect.sid='))?.split(';')[0];

if (!sessionCookie) {
  console.error('❌ No session cookie received');
  process.exit(1);
}

console.log('🍪 Session cookie:', sessionCookie);

// Step 2: Create calendar event
const eventResponse = await fetch('http://localhost:8787/wp-calendar/event', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': sessionCookie
  },
  body: JSON.stringify({
    title: 'WordPress SSO Test Event',
    start: '2025-09-15T14:00',
    end: '2025-09-15T15:00',
    location: 'Meeting Room A',
    description: 'Test event created via WordPress SSO'
  })
});

const eventData = await eventResponse.json();
console.log('📅 Event creation response:', JSON.stringify(eventData, null, 2));

if (eventData.ok) {
  console.log('✅ WordPress SSO event creation successful!');
  console.log('📡 Event ID:', eventData.event.id);
  console.log('🎯 Relay results:', eventData.relay_results);
} else {
  console.error('❌ Event creation failed:', eventData);
}