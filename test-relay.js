import WebSocket from 'ws';

console.log('🔍 Testing relay connection...');

const ws = new WebSocket('wss://relay-rpi.edufeed.org/');

ws.on('open', () => {
  console.log('✅ Connected to relay-rpi.edufeed.org');
  
  const filter = {
    kinds: [31923],
    authors: ['323c252190634267a57367e94a7d21331156764d0ccfe99769edbcb5d85afe86']
  };
  
  const reqMessage = ['REQ', 'test123', filter];
  ws.send(JSON.stringify(reqMessage));
  console.log('📤 Sent REQ:', JSON.stringify(reqMessage));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📥 Received:', msg);
  
  if (msg[0] === 'EVENT') {
    console.log('🎉 EVENT FOUND:');
    console.log('  ID:', msg[2].id);
    console.log('  Kind:', msg[2].kind);
    console.log('  Pubkey:', msg[2].pubkey);
    console.log('  Created:', new Date(msg[2].created_at * 1000).toISOString());
    console.log('  Tags:', msg[2].tags);
  } else if (msg[0] === 'EOSE') {
    console.log('⏹️ End of stored events');
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('❌ Error:', err.message);
});

ws.on('close', () => {
  console.log('🔌 Connection closed');
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Timeout reached');
  ws.close();
}, 10000);