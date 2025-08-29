# Setting Up Multiple API Keys for AI Interview Master

## Why Multiple API Keys?

Your application uses Judge0 API for code execution, which has daily limits on the free plan. By using multiple API keys, you can:

1. **Avoid Rate Limits**: When one key hits its limit, automatically switch to another
2. **Increase Capacity**: Each key has its own quota
3. **Better Reliability**: If one service is down, others can still work

## How to Get Multiple API Keys

### Option 1: Multiple RapidAPI Accounts (Recommended)

1. **Create Additional RapidAPI Accounts**:
   - Go to [RapidAPI](https://rapidapi.com)
   - Sign up with different email addresses
   - Subscribe to [Judge0 API](https://rapidapi.com/judge0-official/api/judge0-ce) on each account
   - Get the API key from each account

2. **Update Your .env File**:
   ```env
   # Your existing key
   JUDGE0_API_KEY=d04650e3bemsha7f30b1dda3fbeap1169ecjsnee1636344e83
   
   # Add new keys (replace with your actual keys)
   JUDGE0_API_KEY_2=your_second_api_key_here
   JUDGE0_API_KEY_3=your_third_api_key_here
   ```

### Option 2: Upgrade to Paid Plan

1. Go to your current RapidAPI account
2. Navigate to Judge0 API
3. Upgrade from BASIC to a paid plan
4. Get higher limits with a single key

### Option 3: Alternative Code Execution Services

You can also add alternative services:

```env
# Replit API (if you want to use Replit for code execution)
REPLIT_API_KEY=your_replit_api_key_here

# CodeX API (alternative to Judge0)
CODEX_API_KEY=your_codex_api_key_here
```

## How It Works

The application will now:

1. **Try the first API key** when executing code
2. **If rate limited (429 error)**, automatically switch to the next key
3. **If all keys are exhausted**, use fallback syntax validation
4. **Show appropriate messages** to users about which service is being used

## Testing Your Setup

1. Add multiple API keys to your `.env` file
2. Restart your server
3. Try running code multiple times
4. Check server logs to see key switching in action

## Tips

- **Use different email addresses** for each RapidAPI account
- **Monitor usage** in your RapidAPI dashboard
- **Consider paid plans** for production use
- **Keep your API keys secure** and never commit them to version control

## Current .env Structure

Your `.env` file should look like this:

```env
FIREBASE_PROJECT_ID=replit-proj
VITE_FIREBASE_API_KEY=AIzaSyCoh2IlXC6i2e3wkmU_lb7IU2FxsvhjwMs
VITE_FIREBASE_PROJECT_ID=replit-proj
VITE_FIREBASE_APP_ID=1:824457236033:web:dc73ade5b39e1f2e4640c0
DATABASE_URL=postgresql://neondb_owner:npg_MRIHZC8j6Ykz@ep-misty-moon-a9m1iqpm-pooler.gwc.azure.neon.tech/neondb?sslmode=require
JUDGE0_API_KEY=d04650e3bemsha7f30b1dda3fbeap1169ecjsnee1636344e83
JUDGE0_API_KEY_2=your_second_key_here
JUDGE0_API_KEY_3=your_third_key_here
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
DEEPSEEK_API_KEY=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
OPENROUTER_API_KEY=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
OPENROUTER_SITE_URL=http://localhost:5000
OPENROUTER_SITE_NAME=AI Interview Master
```

## Troubleshooting

- **"No API keys available"**: Make sure you've added at least one valid API key
- **"Rate limit exceeded"**: Add more API keys or upgrade your plan
- **"Network error"**: Check your internet connection and API service status 