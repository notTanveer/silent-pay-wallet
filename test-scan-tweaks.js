#!/usr/bin/env node

/**
 * Scan Tweak Fetcher - Fetches scan tweaks from Silent Payment Indexer
 * Starting from block 100 to the last indexed block
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const START_BLOCK = 100;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          // If JSON parse fails, return raw data
          resolve({ status: res.statusCode, data: data, raw: true });
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function findLastBlock() {
  log('Finding last indexed block...', 'yellow');
  
  // Try blocks from 100 upwards to 120 (since you mentioned 118 is the last)
  let lastBlock = START_BLOCK - 1;
  
  for (let height = START_BLOCK; height <= 120; height++) {
    try {
      const response = await makeRequest(`/transactions/height/${height}`);
      if (response.status === 200) {
        lastBlock = height;
      } else if (response.status === 429) {
        // Rate limited, wait and try again
        log(`  Rate limited at block ${height}, waiting...`, 'yellow');
        await new Promise(resolve => setTimeout(resolve, 2000));
        height--; // Retry this height
        continue;
      } else {
        break;
      }
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (err) {
      break;
    }
  }
  
  return lastBlock;
}

async function fetchScanTweaks() {
  log('\n========================================', 'cyan');
  log('Silent Payment Scan Tweak Fetcher', 'cyan');
  log('========================================\n', 'cyan');
  
  try {
    // Health check
    log('Step 1: Health Check', 'yellow');
    const health = await makeRequest('/health');
    if (health.status === 200) {
      log('✓ Indexer is healthy', 'green');
    } else {
      log('✗ Indexer health check failed', 'red');
      return;
    }
    log('');
    
    // Find last indexed block
    log('Step 2: Find Last Indexed Block', 'yellow');
    const lastBlock = await findLastBlock();
    log(`✓ Last indexed block: ${lastBlock}`, 'green');
    log(`  Scanning blocks ${START_BLOCK} to ${lastBlock}`, 'blue');
    log('');
    
    if (lastBlock < START_BLOCK) {
      log('✗ No blocks available from height 100', 'red');
      return;
    }
    
    // Fetch all scan tweaks
    log('Step 3: Fetching Scan Tweaks', 'yellow');
    const scanTweaks = [];
    let blocksWithTweaks = 0;
    let totalTweaks = 0;
    
    for (let height = START_BLOCK; height <= lastBlock; height++) {
      try {
        const response = await makeRequest(`/transactions/height/${height}`);
        
        if (response.status === 429) {
          // Rate limited, wait and retry
          log(`  Block ${height}: Rate limited, waiting...`, 'yellow');
          await new Promise(resolve => setTimeout(resolve, 1000));
          height--; // Retry this height
          continue;
        }
        
        if (response.status === 200 && response.data && response.data.transactions) {
          const transactions = response.data.transactions;
          
          if (transactions.length > 0) {
            blocksWithTweaks++;
            
            // Process each transaction
            for (const tx of transactions) {
              if (tx.scanTweak && tx.scanTweak.length > 0) {
                const tweakData = {
                  blockHeight: tx.blockHeight || height,
                  blockHash: tx.blockHash || 'unknown',
                  txid: tx.id,
                  scanTweak: tx.scanTweak,
                  outputs: tx.outputs || [],
                };
                
                scanTweaks.push(tweakData);
                totalTweaks++;
                
                log(`  Block ${height}: ✓ Tweak found (tx: ${tx.id.substring(0, 16)}...)`, 'green');
                log(`    Hash: ${tweakData.blockHash.substring(0, 16)}...`, 'cyan');
                log(`    Tweak: ${tx.scanTweak.substring(0, 32)}...`, 'magenta');
                log(`    Outputs: ${tx.outputs.length}`, 'blue');
              }
            }
            
            if (transactions.length > 0 && !transactions.some(tx => tx.scanTweak)) {
              log(`  Block ${height}: ${transactions.length} tx(s) but no tweaks`, 'blue');
            }
          } else {
            log(`  Block ${height}: No transactions`, 'blue');
          }
        }
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (err) {
        log(`  Block ${height}: Error - ${err.message}`, 'red');
      }
    }
    
    log('');
    log('========================================', 'cyan');
    log('Scan Complete!', 'green');
    log('========================================', 'cyan');
    log('');
    log(`📊 Statistics:`, 'yellow');
    log(`  Total blocks scanned: ${lastBlock - START_BLOCK + 1}`, 'blue');
    log(`  Blocks with tweaks: ${blocksWithTweaks}`, 'green');
    log(`  Total tweaks found: ${totalTweaks}`, 'green');
    log('');
    
    // Save to file
    if (scanTweaks.length > 0) {
      const outputFile = 'scan-tweaks.json';
      fs.writeFileSync(outputFile, JSON.stringify(scanTweaks, null, 2));
      log(`✓ Saved ${totalTweaks} scan tweaks to ${outputFile}`, 'green');
      log('');
      
      // Show first few tweaks
      log('📝 Sample Tweaks:', 'yellow');
      const samplesToShow = Math.min(3, scanTweaks.length);
      for (let i = 0; i < samplesToShow; i++) {
        const tweak = scanTweaks[i];
        log(`\nTransaction in Block ${tweak.blockHeight}:`, 'cyan');
        log(`  TX ID: ${tweak.txid}`, 'blue');
        log(`  Block Hash: ${tweak.blockHash}`, 'blue');
        log(`  Scan Tweak: ${tweak.scanTweak}`, 'magenta');
        log(`  Outputs: ${tweak.outputs.length}`, 'blue');
        if (tweak.outputs.length > 0) {
          log(`  First Output: ${tweak.outputs[0].pubKey.substring(0, 32)}...`, 'cyan');
        }
      }
      log('');
      
      // Summary file
      const summary = {
        startBlock: START_BLOCK,
        endBlock: lastBlock,
        totalBlocks: lastBlock - START_BLOCK + 1,
        blocksWithTweaks: blocksWithTweaks,
        totalTweaks: totalTweaks,
        tweaks: scanTweaks,
        timestamp: new Date().toISOString(),
      };
      
      fs.writeFileSync('scan-tweaks-summary.json', JSON.stringify(summary, null, 2));
      log(`✓ Saved summary to scan-tweaks-summary.json`, 'green');
    } else {
      log('⚠️  No scan tweaks found in the specified range', 'yellow');
    }
    
  } catch (error) {
    log('', 'reset');
    log('========================================', 'red');
    log('Error occurred!', 'red');
    log('========================================', 'red');
    log('');
    log(`Error: ${error.message}`, 'red');
    log('');
  }
}

// Run the scan
fetchScanTweaks().catch(err => {
  console.error('Fatal error:', err);
});
