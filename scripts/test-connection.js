import WebSocket from 'ws';

const url = process.argv[2] || 'ws://localhost:8080';
const token = process.argv[3] || '';

console.log(`Testing connection to: ${url}`);
console.log('----------------------------------------');

// Ignore self-signed certs for testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ws = new WebSocket(url, {
  headers: {
    'Origin': 'http://localhost:5173',
    'User-Agent': 'ClawControl/1.0.0'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket Connected! Waiting for challenge...');
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('📩 Received:', JSON.stringify(response, null, 2));

  // Handle Challenge
  if (response.event === 'connect.challenge') {
    console.log('Received challenge, attempting authentication...');
    if (token) {
      const connectMsg = {
        type: 'req',
        id: '1',
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          role: 'operator',
          client: {
            id: 'gateway-client',
            displayName: 'ClawControl',
            version: '1.0.0',
            platform: 'web',
            mode: 'backend'
          },
          auth: {
            token: token
          }
        }
      };
      console.log('Sending connect frame:', JSON.stringify(connectMsg));
      ws.send(JSON.stringify(connectMsg));
    } else {
      console.log('No token provided, skipping auth.');
    }
    return;
  }

  // Handle Response
  if (response.type === 'res' && response.id === '1') {
    if (!response.ok) {
      console.error('❌ Handshake Failed:', JSON.stringify(response.error, null, 2));
    } else {
      console.log('✅ Handshake Successful!');
      console.log('Server Hello:', JSON.stringify(response.payload, null, 2));
      // No need to list agents via JSON-RPC, we are connected.
      ws.close();
    }
  }
});

ws.on('error', (err) => {
  console.error('❌ Connection Error:', err.message);
});

ws.on('close', () => {
  console.log('----------------------------------------');
  console.log('Connection Closed');
});

function listAgents() {
  console.log('Requesting agent list...');
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'agents.list',
    id: 2
  }));
}
