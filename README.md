# Ollama Model Finder

A recommendation engine that filters Ollama models by RAM tier and use case.

## How It Works

### Input
- **RAM Tier** (required): 16GB, 24GB, 32GB, or 64GB
- **Use Case Filter** (optional): All, Chat, Coding, Reasoning, Vision
- **Search** (optional): Free text search by model name

### Output
- List of compatible models sorted by best fit for the selected RAM tier
- Each model shows: size, quantization, category, and RAM requirement
- "Best Fit" badge on the top recommendation
- Visual fit indicator bar showing how comfortably the model runs

### Quantization Recommendations

| RAM Tier | Recommended | Alternative | Notes |
|----------|-------------|-------------|-------|
| 16GB | q4_k_m | q4_0 | Best balance |
| 24GB | q4_k_m | q5_k_m | Room for better quality |
| 32GB | q5_k_m | q6_k | Can handle higher quality |
| 64GB | q6_k | q8_0 | Full quality possible |

### RAM Estimation
- Models require ~2x their size in RAM to run smoothly
- A 4GB model needs ~8GB available RAM
- Filter excludes models that won't fit in selected tier

## Files

- `index.html` - Main HTML structure
- `script.js` - Recommendation engine logic
- `styles.css` - Mac-friendly styling (SF Pro fonts)
- `README.md` - This file

## Running the App

```bash
# Navigate to the project folder
cd "/Users/OpenClaw/Library/CloudStorage/OneDrive-Personal/OpenClaw Documents/OpenClaw Projects/App Projects/Ollama-Model-Finder"

# Start the server
node server.js
```

Then open in your browser:
- **http://localhost:3000**

The server will:
1. Load cached models from `cache.json` (faster startup)
2. Fetch fresh data from Ollama API if cache is stale (15 min TTL)
3. Serve the web app on port 3000

## API

Fetches live model list from: `https://ollama.com/api/tags`

## Categories

Models are auto-categorized by name patterns:
- **Chat**: llama, mistral, phi, qwen, gemma, etc.
- **Coding**: codellama, deepseek-coder, codeqwen, starcoder, etc.
- **Reasoning**: deepseek-r1, qwq, phi4, command-r, etc.
- **Vision**: llava, moondream, qwen-vl, flux, etc.