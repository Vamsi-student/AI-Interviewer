import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Get the keys from your already-confirmed environment
const rawKeys = process.env.GEMINI_API_KEYS || "";
const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

async function runTest() {
    if (apiKeys.length === 0) {
        console.error("❌ No keys found in environment!");
        return;
    }

    // Try the first key
    const currentKey = apiKeys[0];
    console.log(`Using Key: ${currentKey.substring(0, 8)}...`);

    try {
        const genAI = new GoogleGenerativeAI(currentKey);
        
        // IMPORTANT: Use the clean model name
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent("Hello! Are you working?");
        const response = await result.response;
        console.log("✅ SUCCESS! Response:", response.text());
        
    } catch (err) {
        console.error("❌ Still getting an error:");
        console.error("Status:", err.status);
        console.error("Message:", err.message);
        
        if (err.status === 400) {
            console.log("\n💡 HINT: If the key is valid, check if 'Generative Language API' is enabled in your Google Cloud Console for this key.");
        }
    }
}

runTest();