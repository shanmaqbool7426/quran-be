import fetch from 'node-fetch';

async function simulateApp() {
  const url = 'http://192.168.100.5:8080/api/ai/chat';
  console.log(`[SIMULATION] Connecting to ${url}...`);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is the first surah of the Quran?' }]
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    console.log("[SIMULATION] Connection successful. Reading stream...");
    
    // In node, we can read the body as a stream
    res.body.on('data', chunk => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              process.stdout.write(data.content); // Print like the app would
            }
          } catch (e) {}
        }
      }
    });

    res.body.on('end', () => {
      console.log("\n[SIMULATION] Stream finished.");
    });

  } catch (err) {
    console.error("[SIMULATION] FAILED:", err.message);
  }
}

simulateApp();
