// Ollama Model Finder - Recommendation Engine
// ============================================

// Apple Silicon Chip Specifications (from Apple)
const CHIP_SPECS = {
    M1: {
        name: 'M1',
        year: '2020',
        cpuCores: '8',
        gpuCores: '7-8',
        neuralEngine: '16-core',
        memoryBandwidth: '~66.7 GB/s',
        maxMemory: '16GB',
        notes: 'First generation Apple Silicon'
    },
    M2: {
        name: 'M2',
        year: '2022',
        cpuCores: '8',
        gpuCores: '8-10',
        neuralEngine: '16-core',
        memoryBandwidth: '~100 GB/s',
        maxMemory: '24GB',
        notes: '50% faster than M1, 35% better GPU'
    },
    M3: {
        name: 'M3',
        year: '2023',
        cpuCores: '8',
        gpuCores: '8-10',
        neuralEngine: '16-core',
        memoryBandwidth: '~100 GB/s',
        maxMemory: '24GB',
        notes: 'First 3nm chip, hardware ray tracing'
    },
    M4: {
        name: 'M4',
        year: '2024',
        cpuCores: '8-10',
        gpuCores: '8-10',
        neuralEngine: '16-core',
        memoryBandwidth: '~120 GB/s',
        maxMemory: '32GB',
        notes: 'Second gen 3nm, 50% more memory bandwidth than M1'
    },
    'M4 Pro': {
        name: 'M4 Pro',
        year: '2024',
        cpuCores: '12-16',
        gpuCores: '16-20',
        neuralEngine: '16-core',
        memoryBandwidth: '~273 GB/s',
        maxMemory: '48GB',
        notes: 'Professional performance, massive bandwidth'
    },
    'M4 Max': {
        name: 'M4 Max',
        year: '2024',
        cpuCores: '16',
        gpuCores: '32-40',
        neuralEngine: '16-core',
        memoryBandwidth: '~400 GB/s',
        maxMemory: '128GB',
        notes: 'Ultimate performance, max GPU cores'
    },
    'M3 Ultra': {
        name: 'M3 Ultra',
        year: '2023',
        cpuCores: '16-32',
        gpuCores: '60-80',
        neuralEngine: '32-core',
        memoryBandwidth: '~800 GB/s',
        maxMemory: '192GB',
        notes: 'Ultra performance, massive neural engine'
    }
};

// Use case categories - models mapped by known capabilities
const USE_CASE_CATEGORIES = {
    'Chat': [
        'llama', 'mistral', 'phi', 'qwen', 'gemma', 'command-r', ' Falcon',
        'stablelm', 'neural-chat', 'vicuna', 'orca-mini', 'wizardlm'
    ],
    'Coding': [
        'codellama', 'deepseek-coder', 'codeqwen', 'starcoder', 'WizardCoder',
        'phind-codellama', 'santa-coder', 'ploy'
    ],
    'Reasoning': [
        'deepseek-r1', 'qwq', 'phi4', 'olmo2', 'mistral-large', 'qwen2.5-coder',
        '-command-r', 'rxwx'
    ],
    'Vision': [
        'llava', 'vision', 'moondream', 'bakllava', 'cogvlm', 'llama3-v',
        'qwen-vl', 'paligemma', 'flux'
    ]
};

// Quantization recommendations by RAM tier
const QUANTIZATION_RECOMMENDATIONS = {
    16: { recommended: 'q4_k_m', alternative: 'q4_0', reason: 'Best balance for 16GB' },
    24: { recommended: 'q4_k_m', alternative: 'q5_k_m', reason: 'Room for better quality' },
    32: { recommended: 'q5_k_m', alternative: 'q6_k', reason: 'Can handle higher quality' },
    36: { recommended: 'q5_k_m', alternative: 'q6_k', reason: 'Good quality' },
    48: { recommended: 'q5_k_m', alternative: 'q6_k', reason: 'High quality' },
    64: { recommended: 'q6_k', alternative: 'q8_0', reason: 'Full quality possible' },
    96: { recommended: 'q6_k', alternative: 'q8_0', reason: 'Ultra quality' },
    128: { recommended: 'q8_0', alternative: 'fp16', reason: 'Maximum quality' },
    192: { recommended: 'q8_0', alternative: 'fp16', reason: 'Maximum quality' }
};

// State
let allModels = [];
let filteredModels = [];
let currentChip = 'M3';
let currentRAM = 32;
let currentFilter = 'all';
let currentQuant = '';  // Selected quantization filter
let currentPrecision = 'all';  // Standard (full) vs Quantized filter
let currentSearch = '';
let currentDeploy = 'both';

// Standard (full precision) quantizations
const STANDARD_QUANTS = ['f16', 'f32', 'fp16', 'fp32', 'N/A'];

// Quantized quantizations
const QUANTIZED_QUANTS = ['q2_k', 'q2_k_s', 'q2_k_m', 'q2_k_l', 'q3_k_s', 'q3_k_m', 'q3_k_l', 'q4_0', 'q4_1', 'q4_k_s', 'q4_k_m', 'q5_0', 'q5_1', 'q5_k_s', 'q5_k_m', 'q6_k', 'q8_0'];

// DOM Elements
const chipButtons = document.querySelectorAll('.chip-btn');

// ============================================
// Security: HTML Sanitization
// ============================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
const ramButtons = document.querySelectorAll('.ram-btn');
const filterButtons = document.querySelectorAll('.filter-btn');
const precisionButtons = document.querySelectorAll('.precision-btn');
const deployButtons = document.querySelectorAll('.deploy-btn');
const searchInput = document.getElementById('searchInput');
const quantSelect = document.getElementById('quantSelect');
const modelsGrid = document.getElementById('modelsGrid');
const stats = document.getElementById('stats');
const chipSpecs = document.getElementById('chipSpecs');
const refreshBtn = document.getElementById('refreshBtn');
const upgradeNudge = document.getElementById('upgradeNudge');

// Affiliate URL — replace with your Apple affiliate link once registered
const APPLE_AFFILIATE_URL = 'https://www.apple.com/shop/buy-mac';

// Show or hide the upgrade nudge based on selected RAM
function updateUpgradeNudge(ram) {
    if (ram <= 24) {
        upgradeNudge.style.display = 'flex';
    } else {
        upgradeNudge.style.display = 'none';
    }
}

// Render chip specifications
function renderChipSpecs(chip) {
    const spec = CHIP_SPECS[chip];
    if (!spec) return;
    
    chipSpecs.innerHTML = `
        <div class="specs-grid">
            <div class="spec-item">
                <span class="spec-label">CPU</span>
                <span class="spec-value">${spec.cpuCores} cores</span>
            </div>
            <div class="spec-item">
                <span class="spec-label">GPU</span>
                <span class="spec-value">${spec.gpuCores} cores</span>
            </div>
            <div class="spec-item">
                <span class="spec-label">Neural Engine</span>
                <span class="spec-value">${spec.neuralEngine}</span>
            </div>
            <div class="spec-item">
                <span class="spec-label">Memory Bandwidth</span>
                <span class="spec-value">${spec.memoryBandwidth}</span>
            </div>
            <div class="spec-item">
                <span class="spec-label">Max Memory</span>
                <span class="spec-value">${spec.maxMemory}</span>
            </div>
        </div>
    `;
}

// Adjust RAM recommendations based on chip
function getRecommendedRAMForChip(chip) {
    const chipSpec = CHIP_SPECS[chip];
    const maxMem = parseInt(chipSpec?.maxMemory) || 16;
    
    // Allow all RAM options up to 4x chip max for overcommit headroom
    const allRAM = [16, 24, 32, 36, 48, 64, 96, 128, 192];
    return allRAM.filter(ram => ram <= maxMem * 4);
}

// Get RAM capacity tier for a chip (how much RAM the chip physically supports)
function getChipRAMCapacity(chip) {
    const chipSpec = CHIP_SPECS[chip];
    if (!chipSpec) return 16;
    
    const maxMem = parseInt(chipSpec.maxMemory) || 16;
    return maxMem;
}

// Get effective RAM tier multiplier based on chip bandwidth
// Higher bandwidth chips can load larger quantized models more efficiently
function getChipEfficiencyMultiplier(chip) {
    const bandwidth = CHIP_SPECS[chip]?.memoryBandwidth;
    
    if (!bandwidth) return 1.0;
    
    // M1: ~66.7 GB/s - baseline efficiency
    if (bandwidth.includes('66')) return 1.0;
    // M2/M3: ~100 GB/s - can handle ~1.5x model size
    if (bandwidth.includes('100')) return 1.5;
    // M4: ~120 GB/s - can handle ~1.8x model size
    if (bandwidth.includes('120')) return 1.8;
    // M4 Pro: ~273 GB/s - can handle ~4x model size
    if (bandwidth.includes('273')) return 4.0;
    // M4 Max: ~400 GB/s - can handle ~6x model size
    if (bandwidth.includes('400')) return 6.0;
    // M3 Ultra: ~800 GB/s - can handle ~12x model size
    if (bandwidth.includes('800')) return 12.0;
    
    return 1.0;
}

// Adjust quantization recommendation based on chip memory bandwidth
function getQuantizationForChip(chip) {
    const bandwidth = CHIP_SPECS[chip]?.memoryBandwidth;
    
    if (!bandwidth) return QUANTIZATION_RECOMMENDATIONS[32];
    
    // Higher bandwidth = can handle more memory
    if (bandwidth.includes('120')) return { recommended: 'q5_k_m', alternative: 'q6_k', reason: 'M4: Best bandwidth for quality' };
    if (bandwidth.includes('100')) return { recommended: 'q4_k_m', alternative: 'q5_k_m', reason: 'M2/M3: Solid bandwidth' };
    return { recommended: 'q4_0', alternative: 'q4_k_m', reason: 'M1: Optimized for efficiency' };
}

// Fetch models from local backend API
async function fetchModels() {
    try {
        stats.textContent = 'Loading models from backend...';
        const response = await fetch('http://localhost:3000/api/models');
        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'API returned error');
        
        // Use enriched data from backend
        allModels = (data.models || []).map(model => {
            const sizeGB = typeof model.sizeGB === 'string' ? parseFloat(model.sizeGB) : model.size / (1024 * 1024 * 1024);
            return {
                ...model,
                // Use backend's useCases to determine category (first one or default to Chat)
                category: (model.useCases && model.useCases.length > 0) ? model.useCases[0] : 'Chat',
                // Get quantization from details or extract from name
                quantization: model.details?.quantization_level || extractQuantization(model.name),
                sizeGB: sizeGB,
                ramRequired: Math.ceil(sizeGB * 2) // ~2x for loading
            };
        });
        
        filterAndDisplay();
    } catch (error) {
        console.error('Error fetching models:', error);
        stats.textContent = 'Failed to load models. Please check your connection.';
        modelsGrid.innerHTML = `<div class="error-message">Unable to fetch models from Ollama. Please try again later.</div>`;
    }
}

// Categorize model by name patterns
function categorizeModel(name) {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('llava') || lowerName.includes('vision') || 
        lowerName.includes('vl') || lowerName.includes('moondream') ||
        lowerName.includes('cogvlm') || lowerName.includes('flux')) {
        return 'Vision';
    }
    if (lowerName.includes('codellama') || lowerName.includes('deepseek-coder') ||
        lowerName.includes('code') || lowerName.includes('wizardcoder') ||
        lowerName.includes('starcoder') || lowerName.includes('phind')) {
        return 'Coding';
    }
    if (lowerName.includes('r1') || lowerName.includes('qwq') ||
        lowerName.includes('reasoning') || lowerName.includes('phi4') ||
        lowerName.includes('olmo2') || lowerName.includes('command-r')) {
        return 'Reasoning';
    }
    if (lowerName.includes('llama') || lowerName.includes('mistral') ||
        lowerName.includes('phi') || lowerName.includes('qwen') ||
        lowerName.includes('gemma') || lowerName.includes('falcon') ||
        lowerName.includes('vicuna') || lowerName.includes('wizard') ||
        lowerName.includes('stablelm') || lowerName.includes('orca')) {
        return 'Chat';
    }
    return 'Chat'; // Default to chat for unknown
}

// Extract quantization from model name
function extractQuantization(name) {
    const match = name.match(/:([q][0-9_]+)/);
    return match ? match[1].replace(/_/g, '-') : 'N/A';
}

// Determine if model is suitable for local or cloud deployment
function getDeploymentSuitability(name) {
    const lowerName = name.toLowerCase();
    
    // Large models (>10GB) typically need cloud
    const isLarge = (size) => size > 10;
    
    // Models with specific patterns that work well locally
    const goodLocalModels = [
        'llama:7b', 'llama:8b', 'mistral', 'phi3', 'phi4',
        'qwen:7b', 'qwen:8b', 'gemma:2b', 'gemma:7b',
        'codellama:7b', 'codellama:8b', 'deepseek-coder:1.3b',
        'deepseek-coder:6.7b', 'starcoder', 'codeqwen'
    ];
    
    // Check if model is typically cloud-only (very large or reasoning models)
    const cloudOnlyPatterns = ['deepseek-r1', 'qwq', 'qwen2.5-coder:32b', 'qwen2.5-coder:14b'];
    
    for (const pattern of cloudOnlyPatterns) {
        if (lowerName.includes(pattern)) return 'cloud';
    }
    
    // Check if good for local
    for (const model of goodLocalModels) {
        if (lowerName.includes(model.replace(':7b', '').replace(':8b', '').replace(':6.7b', '').replace(':1.3b', '').replace(':2b', '').replace(':14b', '').replace(':32b', ''))) {
            // Verify size constraint
            return 'local';
        }
    }
    
    // Default: depends on size
    return 'both';
}

// Filter and sort models by RAM tier fit
function filterAndDisplay() {
    // Show all models but mark which are runnable with current RAM
    const availableRAM = currentRAM;
    const quantRecs = getQuantizationForChip(currentChip);
    const efficiencyMultiplier = getChipEfficiencyMultiplier(currentChip);
    const chipCapacity = getChipRAMCapacity(currentChip);
    
    filteredModels = allModels.filter(model => {
        // Calculate effective RAM needed considering chip efficiency
        // High bandwidth chips can load larger models more efficiently
        const effectiveRamNeeded = model.ramRequired / efficiencyMultiplier;
        
        // Also factor in the user's selected RAM tier (not just hardware max)
        // If user selects 12GB RAM but has M3 Ultra hardware, they can still run larger quantized models
        const userRamTier = currentRAM;
        
        // RAM filter - show models that can fit with current selection, considering chip efficiency
        // Models need to fit in user's RAM selection, adjusted for chip efficiency
        if (effectiveRamNeeded > userRamTier) return false;
        
        // Use case filter
        if (currentFilter !== 'all' && model.category !== currentFilter) return false;
        
        // Quantization filter
        if (currentQuant && !model.quantization.toLowerCase().includes(currentQuant.toLowerCase())) return false;
        
        // Precision filter (Standard vs Quantized)
        if (currentPrecision !== 'all') {
            const q = model.quantization.toLowerCase();
            const isStandard = STANDARD_QUANTS.includes(q) || STANDARD_QUANTS.some(sq => q.includes(sq.toLowerCase()));
            const isQuantized = QUANTIZED_QUANTS.some(qq => q.includes(qq));
            
            if (currentPrecision === 'standard' && !isStandard) return false;
            if (currentPrecision === 'quantized' && !isQuantized) return false;
        }
        
        // Search filter
        if (currentSearch && !model.name.toLowerCase().includes(currentSearch.toLowerCase())) return false;
        
        // Deployment type filter
        if (currentDeploy !== 'both') {
            const suitability = getDeploymentSuitability(model.name);
            if (suitability !== 'both' && suitability !== currentDeploy) return false;
        }
        
        return true;
    });
    
    // Sort by best fit: models that fit comfortably in RAM first, then by size
    filteredModels.sort((a, b) => {
        // Priority 1: How well it fits the RAM tier
        const aHeadroom = availableRAM - a.ramRequired;
        const bHeadroom = availableRAM - b.ramRequired;
        
        // Models with more headroom rank higher (can run smoother)
        if (bHeadroom !== aHeadroom) return bHeadroom - aHeadroom;
        
        // Priority 2: Within similar headroom, prefer larger (better quality)
        return b.sizeGB - a.sizeGB;
    });
    
    renderModels();
}

// Render all quantization options for a model
function renderQuantOptions(quantizations) {
    if (!quantizations || quantizations.length === 0) {
        return '<div class="no-quants">No quantization options available</div>';
    }
    
    // Sort by size (smallest first)
    const sorted = [...quantizations].sort((a, b) => (a.sizeGB || 0) - (b.sizeGB || 0));
    
    return `
        <div class="quant-grid">
            ${sorted.map(q => {
                const fitsRAM = q.ramRequired <= currentRAM;
                const rec = q.quantization === 'Q4_K_M' || q.quantization === 'Q5_K_M';
                return `
                    <div class="quant-option ${fitsRAM ? 'fits' : 'no-fit'} ${rec ? 'recommended' : ''}">
                        <div class="quant-name">${escapeHtml(q.variant)}</div>
                        <div class="quant-size">${q.sizeGB ? escapeHtml(q.sizeGB.toFixed(1)) + ' GB' : 'N/A'}</div>
                        <div class="quant-ram">RAM: ${escapeHtml(String(q.ramRequired || '?'))}GB</div>
                        <code class="quant-cmd">${escapeHtml(q.pullCommand)}</code>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Render models to grid
function renderModels() {
    const quantRecs = getQuantizationForChip(currentChip);
    
    if (filteredModels.length === 0) {
        modelsGrid.innerHTML = `<div class="no-results">No models found matching "${currentFilter}" filter. Try a different category.</div>`;
        stats.textContent = '';
        return;
    }
    
    // Sort: models that fit current RAM first, considering chip efficiency
    const efficiencyMultiplier = getChipEfficiencyMultiplier(currentChip);
    filteredModels.sort((a, b) => {
        const aEffectiveRam = (a.ramRequired || 0) / efficiencyMultiplier;
        const bEffectiveRam = (b.ramRequired || 0) / efficiencyMultiplier;
        const aFits = aEffectiveRam <= currentRAM;
        const bFits = bEffectiveRam <= currentRAM;
        if (aFits && !bFits) return -1;
        if (!aFits && bFits) return 1;
        // Secondary sort: prefer larger models that still fit
        return (b.ramRequired || 0) - (a.ramRequired || 0);
    });
    
    // Add chip info to stats
    const chipInfo = `${currentChip} (${CHIP_SPECS[currentChip]?.memoryBandwidth})`;
    stats.textContent = `${filteredModels.length} models available • ${chipInfo} • Recommended: ${quantRecs.recommended}`;
    
    modelsGrid.innerHTML = filteredModels.map((model, index) => {
        const isRecommended = model.quantization === quantRecs.recommended || 
                             model.quantization === quantRecs.alternative;
        const fitScore = calculateFitScore(model, currentRAM);
        const efficiencyMultiplier = getChipEfficiencyMultiplier(currentChip);
        const effectiveRamNeeded = Math.round(model.ramRequired / efficiencyMultiplier);
        // Use API data for deployment type, fallback to heuristic
        const supportsLocal = model.supportsLocal !== undefined ? model.supportsLocal : 
                             getDeploymentSuitability(model.name) !== 'cloud';
        const supportsCloud = model.supportsCloud !== undefined ? model.supportsCloud : 
                             getDeploymentSuitability(model.name) !== 'local';
        const baseName = escapeHtmlAttr(model.baseName || model.name.split(':')[0]);
        
        // Determine deployment type label
        let deployType = 'both';
        let deployLabel = '⚡ Both';
        if (supportsLocal && supportsCloud) {
            deployType = 'both';
            deployLabel = '⚡ Both';
        } else if (supportsLocal && !supportsCloud) {
            deployType = 'local';
            deployLabel = '💻 Local';
        } else if (!supportsLocal && supportsCloud) {
            deployType = 'cloud';
            deployLabel = '☁️ Cloud';
        }
        
        return `
            <div class="model-card ${isRecommended ? 'recommended' : ''}" data-base="${baseName}">
                <div class="model-header">
                    <h3>${escapeHtml(model.name)}</h3>
                    ${index === 0 ? '<span class="best-fit-badge">★ Best Fit</span>' : ''}
                </div>
                <div class="model-meta">
                    <span class="meta-item">
                        <span class="meta-icon">RAM</span>
                        ${model.sizeGB ? escapeHtml(model.sizeGB.toFixed(1)) : 'N/A'} GB
                    </span>
                    <span class="meta-item">
                        <span class="meta-icon">QNT</span>
                        ${escapeHtml(model.quantization || 'N/A')}
                    </span>
                    <span class="meta-item category-${escapeHtmlAttr(model.category ? model.category.toLowerCase() : 'general')}">
                        ${escapeHtml(model.category || 'General')}
                    </span>
                </div>
                <div class="deployment-badge ${deployType}">${deployLabel}</div>
                <div class="model-footer">
                    <span class="ram-needed ${effectiveRamNeeded > currentRAM ? 'no-fit' : 'fits'}">${'Needs ~' + effectiveRamNeeded + 'GB RAM (effective)'}</span>
                    ${isRecommended ? `<span class="rec-badge">${escapeHtml(quantRecs.reason)}</span>` : ''}
                </div>
                <button class="show-quants-btn" data-model="${baseName}">
                    Show All Quantizations ▼
                </button>
                <div class="quant-options" id="quants-${baseName}" style="display: none;"></div>
                <div class="fit-indicator">
                    <div class="fit-bar" style="width: ${fitScore}%"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add click handlers for quant buttons
    document.querySelectorAll('.show-quants-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const modelName = e.target.dataset.model;
            const container = document.getElementById(`quants-${modelName}`);
            
            if (container.style.display === 'none') {
                // Show quantizations
                if (container.innerHTML === '') {
                    container.innerHTML = '<div class="loading">Loading...</div>';
                    try {
                        const resp = await fetch(`http://localhost:3000/api/quantizations/${modelName}`);
                        const data = await resp.json();
                        if (data.success) {
                            container.innerHTML = renderQuantOptions(data.quantizations);
                        } else {
                            container.innerHTML = '<div class="error">Failed to load quantizations</div>';
                        }
                    } catch (err) {
                        container.innerHTML = '<div class="error">Error loading quantizations</div>';
                    }
                }
                container.style.display = 'block';
                e.target.textContent = 'Hide Quantizations ▲';
            } else {
                container.style.display = 'none';
                e.target.textContent = 'Show All Quantizations ▼';
            }
        });
    });
}

// Calculate how well a model fits the RAM tier (0-100)
function calculateFitScore(model, ramTier) {
    const headroom = ramTier - model.ramRequired;
    const maxHeadroom = ramTier * 0.5; // 50% headroom = perfect
    return Math.min(100, Math.max(0, (headroom / maxHeadroom) * 100));
}

// Event Handlers
chipButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        chipButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentChip = btn.dataset.chip;
        renderChipSpecs(currentChip);
        filterAndDisplay();
    });
});

ramButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        ramButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentRAM = parseInt(btn.dataset.ram);
        updateUpgradeNudge(currentRAM);
        filterAndDisplay();
    });
});

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        filterAndDisplay();
    });
});

// Precision filter handler
precisionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        precisionButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPrecision = btn.dataset.precision;
        filterAndDisplay();
    });
});

searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    filterAndDisplay();
});

// Quantization filter handler
quantSelect.addEventListener('change', (e) => {
    currentQuant = e.target.value;
    filterAndDisplay();
});

deployButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        deployButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDeploy = btn.dataset.deploy;
        filterAndDisplay();
    });
});

// Refresh/Reset Button - Clears all filters and re-fetches data
refreshBtn.addEventListener('click', async () => {
    // Reset state to defaults
    currentChip = 'M3';
    currentRAM = 32;
    currentFilter = 'all';
    currentQuant = '';
    currentPrecision = 'all';
    currentSearch = '';
    currentDeploy = 'both';
    
    // Reset UI: Chip buttons
    chipButtons.forEach(b => b.classList.remove('selected'));
    document.querySelector('.chip-btn[data-chip="M3"]').classList.add('selected');
    renderChipSpecs('M3');
    
    // Reset UI: RAM buttons
    ramButtons.forEach(b => b.classList.remove('selected'));
    document.querySelector('.ram-btn[data-ram="32"]').classList.add('selected');
    
    // Reset UI: Filter buttons
    filterButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
    
    // Reset UI: Precision buttons
    precisionButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.precision-btn[data-precision="all"]').classList.add('active');
    
    // Reset UI: Deploy buttons
    deployButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.deploy-btn[data-deploy="both"]').classList.add('active');
    
    // Reset UI: Search and select inputs
    searchInput.value = '';
    quantSelect.value = '';

    // Reset nudge (default RAM is 32GB — no nudge)
    updateUpgradeNudge(currentRAM);

    // Re-fetch models from backend
    await fetchModels();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Apply default selected state to initial chip and RAM buttons
    document.querySelector(`.chip-btn[data-chip="${currentChip}"]`)?.classList.add('selected');
    document.querySelector(`.ram-btn[data-ram="${currentRAM}"]`)?.classList.add('selected');
    updateUpgradeNudge(currentRAM);
    renderChipSpecs(currentChip);
    fetchModels();
});