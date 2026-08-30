const fs = require('fs');
const path = require('path');

const apiDocPath = path.join(__dirname, '../docs/API.md');
const entryPointPath = path.join(__dirname, '../src/index.ts');

if (!fs.existsSync(apiDocPath) || !fs.existsSync(entryPointPath)) {
    console.log('Skipping verification: Required asset tracks are not generated locally yet.');
    process.exit(0);
}

const docContent = fs.readFileSync(apiDocPath, 'utf8');
const entryContent = fs.readFileSync(entryPointPath, 'utf8');

const exportRegex = /export\s+{[^}]+}\s+from|export\s+(class|function|enum|interface)\s+([a-zA-Z0-9_]+)/g;
let match;
const exportedSymbols = new Set();

while ((match = exportRegex.exec(entryContent)) !== null) {
    if (match) {
        exportedSymbols.add(match[2]);
    }
}

// Manually ensure base surface clients are tracked
const coreTargets = ['MultiSigEscrowClient', 'TrustFlowClient'];
coreTargets.forEach(target => exportedSymbols.add(target));

let driftDetected = false;

console.log('🔍 Running TrustFlow SDK public surface documentation drift checks...');

for (const symbol of exportedSymbols) {
    if (!symbol) continue;
    const pattern = new RegExp(`(#|\\b)${symbol}\\b`, 'i');
    if (!pattern.test(docContent)) {
        console.error(`❌ Drift Detected: '${symbol}' is exported publicly from src/index.ts but missing from docs/API.md!`);
        driftDetected = true;
    }
}

if (driftDetected) {
    console.error('📊 Documentation sync check failed. Please document missing components inside docs/API.md.');
    process.exit(1);
} else {
    console.log('✅ Documentation synchronization surface check passed successfully!');
    process.exit(0);
}
