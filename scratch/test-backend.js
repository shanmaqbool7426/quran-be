import fetch from 'node-fetch';

async function test() {
  console.log("Testing backend at http://localhost:8080/api/ai/chat-sync...");
  try {
    const res = await fetch('http://localhost:8080/api/ai/chat-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "System is working"' }]
      })
    });
    
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
    if (data.content) {
      console.log("✅ SUCCESS: Backend is responding correctly!");
    } else {
      console.log("❌ FAILED: Backend returned no content.");
    }
  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

test();
