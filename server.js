// Ollama Model Finder - Backend Server
// Fetches and caches model data from ollama.com
// ====================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000; // Railway sets PORT automatically; fallback to 3000 locally
const CACHE_FILE = path.join(__dirname, 'cache.json');
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Simple cache
let modelCache = {
    data: null,
    timestamp: null
};

// Load cache from file on startup
function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf8');
            const cached = JSON.parse(raw);
            modelCache = cached;
            console.log(`📦 Loaded cache from ${CACHE_FILE}`);
        }
    } catch (err) {
        console.error('Failed to load cache:', err.message);
    }
}

// Save cache to file
function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(modelCache, null, 2));
        console.log('💾 Cache saved to disk');
    } catch (err) {
        console.error('Failed to save cache:', err.message);
    }
}

// HTTP GET helper
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-AU,en;q=0.9'
            }
        };
        const req = https.get(url, options, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpsGet(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// Fetch models from local Ollama instance
async function fetchModelsFromOllama() {
    console.log('🌐 Fetching model list from local Ollama...');
    
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
        const data = await response.json();
        
        return (data.models || []).map(m => ({
            name: m.name,
            size: m.size,
            digest: m.digest,
            modified_at: m.modified_at,
            details: m.details || {},
            source: 'local-ollama'
        }));
    } catch (err) {
        console.error('Failed to fetch from local Ollama:', err.message);
        return [];
    }
}

// Fetch from library.ollama.com
async function fetchFromOllamaLibrary() {
    try {
        const data = await httpsGet('https://library.ollama.com/catalog.json');
        const parsed = JSON.parse(data);
        
        return Object.entries(parsed).map(([name, info]) => ({
            name: name,
            size: info.size || 0,
            tags: info.tags || [],
            description: info.description || '',
            source: 'library.ollama.com'
        }));
    } catch (err) {
        console.log('library.ollama.com not available:', err.message);
        return [];
    }
}

// Parse models from Ollama search page HTML
function extractModelsFromHtml(html) {
    const models = [];
    const seen = new Set();
    
    // Extract model names from /library/NAME hrefs
    const namePattern = /\/library\/([a-z][a-z0-9_-]+)/gi;
    let match;
    while ((match = namePattern.exec(html)) !== null) {
        const name = match[1];
        if (!seen.has(name) && name.length > 2) {
            seen.add(name);
            // Default placeholder values - will be enriched later
            models.push({
                name: name,
                size: 0,
                tags: [],
                description: '',
                source: 'ollama.com'
            });
        }
    }
    
    // Try to extract pull counts - look for the pattern near model names
    const pullPattern = /(\d+\.?\d*[KMB]?)\s*Pulls?/gi;
    const pulls = [];
    while ((match = pullPattern.exec(html)) !== null) {
        pulls.push(match[1]);
    }
    
    // Try to extract tag counts
    const tagPattern = /(\d+)\s*Tag(s)?/gi;
    const tagCounts = [];
    while ((match = tagPattern.exec(html)) !== null) {
        tagCounts.push(parseInt(match[1]));
    }
    
    // Try to extract capabilities/categories
    const capPattern = /<(?:span|label)[^>]*>([a-z]+)<\/(?:span|label)>/gi;
    const capabilities = [];
    while ((match = capPattern.exec(html)) !== null) {
        const cap = match[1].toLowerCase();
        if (['vision', 'embedding', 'tools', 'thinking', 'cloud', 'audio'].includes(cap)) {
            capabilities.push(cap);
        }
    }
    
    // Enrich models with capabilities
    models.forEach((model, idx) => {
        // Assign capabilities based on model name patterns
        const nameLower = model.name.toLowerCase();
        const modelCaps = [];
        
        if (nameLower.includes('vision') || nameLower.includes('llava') || nameLower.includes('visionary')) {
            modelCaps.push('vision');
        }
        if (nameLower.includes('embed')) {
            modelCaps.push('embedding');
        }
        if (nameLower.includes('coder') || nameLower.includes('code')) {
            modelCaps.push('tools');
        }
        if (nameLower.includes('think') || nameLower.includes('reason')) {
            modelCaps.push('thinking');
        }
        if (nameLower.includes('cloud')) {
            modelCaps.push('cloud');
        }
        if (nameLower.includes('audio')) {
            modelCaps.push('audio');
        }
        
        model.capabilities = modelCaps.length ? modelCaps : ['General'];
    });
    
    return models;
}

// Fetch all quantization variants for a specific model from its tags page
async function fetchQuantizationsForModel(modelName) {
    try {
        const url = `https://ollama.com/library/${modelName}/tags`;
        const html = await httpsGet(url);
        
        // Extract all variant tags (e.g., llama3.2:1b-instruct-q4_K_M)
        const variants = [];
        const seen = new Set();
        
        const variantPattern = /href="\/library\/([^:"]+):([^"]+)"/gi;
        let match;
        while ((match = variantPattern.exec(html)) !== null) {
            const baseName = match[1];
            const variant = match[2];
            const fullName = `${baseName}:${variant}`;
            
            if (!seen.has(fullName) && baseName === modelName) {
                seen.add(fullName);
                variants.push(variant);
            }
        }
        
        // Extract sizes for each variant
        const quantSizes = {};
        const sizePattern = /(\d+\.?\d*)\s*GB/gi;
        const variantBlocks = html.split(/href="\/library\/${modelName}:/);
        
        for (const variant of variants) {
            // Try to find size for this variant
            const blockMatch = html.match(new RegExp(`${modelName}:${variant}.*?(\d+\.?\d*)\s*GB`, 's'));
            if (blockMatch) {
                quantSizes[variant] = parseFloat(blockMatch[1]);
            }
        }
        
        return { variants, sizes: quantSizes };
    } catch (err) {
        console.error(`Failed to fetch quantizations for ${modelName}:`, err.message);
        return { variants: [], sizes: {} };
    }
}

// Get list of popular models from search
async function fetchModelList() {
    try {
        const html = await httpsGet('https://ollama.com/search');
        const models = [];
        const seen = new Set();
        
        // Extract model names from /library/NAME hrefs
        const namePattern = /\/library\/([a-z][a-z0-9_-]+)/gi;
        let match;
        while ((match = namePattern.exec(html)) !== null) {
            const name = match[1];
            if (!seen.has(name) && name.length > 2) {
                seen.add(name);
                models.push({ name, source: 'ollama.com' });
            }
        }
        
        return models;
    } catch (err) {
        console.error('Failed to fetch model list:', err.message);
        return [];
    }
}

// Fetch from ollama.com search with query
async function fetchFromOllamaSearch(query = '') {
    try {
        console.log(`🌐 Fetching from ollama.com/search?q=${query}...`);
        const url = query ? `https://ollama.com/search?q=${encodeURIComponent(query)}` : 'https://ollama.com/search';
        const html = await httpsGet(url);
        return extractModelsFromHtml(html);
    } catch (err) {
        console.error('Failed to fetch from ollama.com:', err.message);
        return [];
    }
}

// Get models from ollama.com public library (with caching)
async function getModels(forceRefresh = false) {
    const now = Date.now();
    
    // Check if cache is valid
    if (!forceRefresh && modelCache.data && modelCache.timestamp) {
        if (now - modelCache.timestamp < CACHE_TTL_MS) {
            console.log('📋 Serving from cache');
            return modelCache.data;
        }
    }
    
    // Fetch fresh data from ollama.com public library
    try {
        const models = await fetchFromOllamaSearch();
        
        modelCache = {
            data: models,
            timestamp: now
        };
        
        saveCache();
        console.log(`✅ Fetched ${models.length} models from ollama.com`);
        return models;
    } catch (err) {
        // Return stale cache if available
        if (modelCache.data) {
            console.log('⚠️ Returning stale cache due to fetch error');
            return modelCache.data;
        }
        throw err;
    }
}

// Parse size string to bytes
function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    sizeStr = sizeStr.toString().toUpperCase();
    
    const match = sizeStr.match(/([\d.]+)\s*([GM]B)/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    return unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
}

// Enhanced model metadata enrichment
function enrichModelData(models) {
    return models.map(model => {
        const name = model.name;
        
        // Extract quantization from name
        const quantMatch = name.match(/:([q][0-9_]+)/);
        const quantization = quantMatch ? quantMatch[1].replace('_', '-') : null;
        
        // Detect model family/base
        const baseName = name.split(':')[0].split('/').pop();
        
        // Estimate use case based on name patterns
        const useCases = detectUseCases(name);
        
        // Parse parameter count if in name
        const paramsMatch = name.match(/(\d+\.?\d*)([bm])/i);
        const parameters = paramsMatch ? {
            value: parseFloat(paramsMatch[1]),
            scale: paramsMatch[2].toLowerCase()
        } : null;
        
        // Estimate size if not available - based on model name patterns
        let estimatedSizeGB = null;
        if (!model.size || model.size === 0) {
            estimatedSizeGB = estimateSizeFromName(model.name);
        }
        
        // Determine deployment suitability based on model size and capabilities
        const sizeGB = estimatedSizeGB || (model.size ? model.size / (1024 * 1024 * 1024) : 4);
        const capabilities = model.capabilities || [];
        const supportsLocal = determineLocalSupport(name, sizeGB, capabilities);
        const supportsCloud = determineCloudSupport(name, sizeGB, capabilities);
        
        return {
            ...model,
            baseName,
            quantization,
            useCases,
            parameters,
            sizeGB: model.size ? (model.size / (1024 * 1024 * 1024)).toFixed(1) : (estimatedSizeGB ? estimatedSizeGB.toFixed(1) : null),
            supportsLocal,
            supportsCloud
        };
    });
}

// Determine if model supports local deployment
// Local: <= 7GB  — runs comfortably on any Mac (fits in 16GB RAM with headroom)
// Both:  7–40GB  — viable on higher-end Macs, also suits cloud
// Cloud: > 40GB  — impractical on most Macs regardless of chip
function determineLocalSupport(name, sizeGB, capabilities) {
    if (capabilities.includes('embedding')) return false;
    return sizeGB <= 40;
}

// Determine if model supports cloud deployment
function determineCloudSupport(name, sizeGB, capabilities) {
    if (capabilities.includes('embedding')) return true;
    // Small models (<=7GB) are Local-only — no cloud badge needed
    return sizeGB > 7;
}

// Estimate size based on parameter count and quantization
function estimateSize(modelName, variant) {
    // Extract parameter size from variant (e.g., "1b", "3b", "7b", "8b", "14b")
    const paramMatch = variant.match(/(\d+\.?\d*)([bm])/i);
    if (!paramMatch) {
        // Default fallback based on common model sizes
        return 4.0; // 4GB default
    }
    
    let paramCount = parseFloat(paramMatch[1]);
    const scale = paramMatch[2].toLowerCase();
    const paramsInBillions = scale === 'b' ? paramCount : paramCount / 1000;
    
    // Extract quantization level
    const qMatch = variant.match(/(q[0-9_]+)/i);
    const quant = qMatch ? qMatch[1].toLowerCase() : 'q4_k_m';
    
    // Bytes per parameter based on quantization
    const quantBytes = {
        'q2_k': 0.28, 'q3_k_s': 0.37, 'q3_k_m': 0.45, 'q3_k_l': 0.55,
        'q4_0': 0.58, 'q4_1': 0.70, 'q4_k_s': 0.60, 'q4_k_m': 0.75,
        'q5_0': 0.82, 'q5_1': 0.95, 'q5_k_s': 0.85, 'q5_k_m': 1.0,
        'q6_k': 1.33, 'q8_0': 1.78, 'f16': 2.0, 'f32': 4.0
    };
    
    // Find matching quantization
    let bytesPerParam = 0.75; // Default to q4_k_m
    for (const [q, bytes] of Object.entries(quantBytes)) {
        if (quant.includes(q.replace('_', ''))) {
            bytesPerParam = bytes;
            break;
        }
    }
    
    const sizeGB = paramsInBillions * bytesPerParam;
    return Math.round(sizeGB * 10) / 10; // Round to 1 decimal
}

// Estimate size from model name (without variant)
function estimateSizeFromName(modelName) {
    const name = modelName.toLowerCase();
    
    // Extract parameter size from name (e.g., "qwen3", "llama3-70b", "codellama-7b")
    const paramMatch = name.match(/(\d+\.?\d*)([bm])/i);
    let paramsInBillions = 7; // Default: assume 7B params
    
    if (paramMatch) {
        let paramCount = parseFloat(paramMatch[1]);
        const scale = paramMatch[2].toLowerCase();
        paramsInBillions = scale === 'b' ? paramCount : paramCount / 1000;
    } else {
        // Known model families with their typical sizes
        const modelSizes = {
            // Large models (70B+)
            'qwen': 72, 'qwen3': 32, 'qwen2.5': 32, 'llama3': 70, 'llama-3': 70,
            'mistral-large': 123, 'mixtral': 47, 'mixtral-8x22b': 141,
            'command-r': 35, 'command-r-plus': 104,
            'falcon': 180, 'wizardlm': 70, 'yi': 34,
            // Medium models (30B-70B)
            'phi4': 30, 'phi-4': 30, 'phi3': 14, 'phi-3': 14,
            'gemma': 27, 'gemma4': 27, 'glm4': 30, 'glm-4': 30,
            'deepseek-coder': 33, 'deepseek-coder-v2': 56,
            'codellama': 34, 'codeqwen': 7, 'qwen2.5-coder': 14,
            // Small models (<= 14B)
            'llama': 8, 'llama2': 13, 'llama-2': 13, 'llama3.1': 8,
            'mistral': 7, 'ministral': 8,
            'phi2': 3, 'phi-2': 3,
            'gemma2': 9, 'gemma-2': 9,
            'qwen2': 7,
            'stablelm': 12, 'vicuna': 13, 'orca': 14,
            'starcoder': 16, 'wizardcoder': 34,
            // Reasoning models
            'deepseek-r1': 67, 'qwq': 32, 'olmo2': 13,
            // Vision models
            'llava': 7, 'vision': 7, 'moondream': 1, 'qwen-vl': 7,
            'paligemma': 3, 'cogvlm': 14,
            // Embedding models
            'nomic-embed': 0.14, 'embed': 0.14,
            // Recent models
            'minimax': 45, 'nemotron': 47,
            'glm': 9, 'glm5': 9,
            'lfm2': 40, 'lfm-2': 40,
            'kimi': 72, 'rnj': 37, 'devstral': 7
        };
        
        for (const [prefix, size] of Object.entries(modelSizes)) {
            if (name.includes(prefix)) {
                paramsInBillions = size;
                break;
            }
        }
    }
    
    // Default to Q4_K_M quantization (0.75 bytes per param)
    const bytesPerParam = 0.75;
    const sizeGB = paramsInBillions * bytesPerParam;
    return Math.round(sizeGB * 10) / 10;
}

// Detect use cases from model name
function detectUseCases(name) {
    const nameLower = name.toLowerCase();
    const useCases = [];
    
    const patterns = {
        'Chat': ['chat', 'chatml', 'instruct'],
        'Coding': ['code', 'codellama', 'codegen', 'santa', 'deepseek-coder'],
        'Reasoning': ['reason', 'reasoning', 'math', 'logic'],
        'Vision': ['vision', 'visionary', 'llava', 'ocr'],
        'Embedding': ['embed', 'embedding', 'nomic'],
        'Creative': ['creative', 'story', 'writing'],
        'Assistant': ['assistant', 'help', 'helpfulness']
    };
    
    for (const [useCase, keywords] of Object.entries(patterns)) {
        if (keywords.some(k => nameLower.includes(k))) {
            useCases.push(useCase);
        }
    }
    
    return useCases.length ? useCases : ['General'];
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // Routes
    if (req.url.startsWith('/api/models')) {
        try {
            const forceRefresh = req.url.includes('refresh=true');
            let models = await getModels(forceRefresh);
            models = enrichModelData(models);
            
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, count: models.length, models }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }
    
    if (req.url === '/api/cache/clear') {
        modelCache = { data: null, timestamp: null };
        saveCache();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Cache cleared' }));
        return;
    }
    
    if (req.url === '/api/health') {
        const cacheAge = modelCache.timestamp ? Date.now() - modelCache.timestamp : null;
        res.writeHead(200);
        res.end(JSON.stringify({ 
            status: 'ok', 
            cacheAge: cacheAge ? `${Math.round(cacheAge/1000)}s ago` : 'cold',
            modelCount: modelCache.data?.length || 0
        }));
        return;
    }
    
    // API: Get all quantization options for a specific model
    const quantMatch = req.url.match(/\/api\/quantizations\/(.+)/);
    if (quantMatch) {
        const modelName = decodeURIComponent(quantMatch[1]);
        try {
            const result = await fetchQuantizationsForModel(modelName);
            
            // Now get size for each quantization
            const quantOptions = [];
            for (const variant of result.variants) {
                // Extract quant level from variant name (case insensitive) - handle q2_K, q4_K_M, etc.
                const qMatch = variant.match(/(q[0-9]+_[a-z]+)/i) || variant.match(/(q[0-9]+)/i);
                let quantLevel = qMatch ? qMatch[1].toUpperCase() : variant;
                
                // Try to get size from the sizes map or estimate from parameter size
                const sizeGB = result.sizes[variant] || estimateSize(modelName, variant);
                
                quantOptions.push({
                    variant: variant,
                    quantization: quantLevel,
                    sizeGB: sizeGB,
                    ramRequired: Math.ceil((sizeGB || 0) * 2),
                    pullCommand: `ollama run ${modelName}:${variant}`
                });
            }
            
            res.writeHead(200);
            res.end(JSON.stringify({ 
                success: true, 
                model: modelName,
                quantizations: quantOptions 
            }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }
    
    // API: Get list of available models
    if (req.url === '/api/model-list') {
        try {
            const models = await fetchModelList();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, count: models.length, models }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }
    
    // Default: serve static files
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);
    
    // Security: Prevent path traversal attacks
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(__dirname))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.xml': 'application/xml'
    };
    
    try {
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    } catch (err) {
        res.writeHead(500);
        res.end('Server error');
    }
});

// Start server
loadCache();
server.listen(PORT, () => {
    console.log(`
🚀 Ollama Model Finder Backend
   Server running at http://localhost:${PORT}
   API: http://localhost:${PORT}/api/models
   Cache file: ${CACHE_FILE}
    `);
});