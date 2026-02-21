/**
 * Production-Level GS1 Application Identifier (AI) Parser
 * 
 * Features:
 * - Robust parsing with false-positive protection
 * - Variable-length AI handling with lookahead validation
 * - Strict and lenient modes
 * - Comprehensive error reporting
 * 
 * @example
 * const result = parseGS1Barcode('010880007730012410B5039240102917270923');
 * // {
 * //   fields: { '01': ['08800077300124'], '10': ['B503924'] },
 * //   primary_gtin: '08800077300124',
 * //   errors: [...],
 * //   raw_tail: '0102917270923'
 * // }
 */

/**
 * GS1 AI Dictionary
 * Format: { ai: { name, length, type } }
 * - length: number for fixed-length, 'variable' for variable-length
 * - type: 'numeric' or 'alphanumeric'
 */
const AI_DICTIONARY: Record<string, {
  name: string;
  length: number | 'variable';
  type: 'numeric' | 'alphanumeric';
  maxLength?: number; // For variable-length AIs
  isDate?: boolean; // If true, validate and convert YYMMDD → YYYY-MM-DD
}> = {
  '01': { name: 'GTIN', length: 14, type: 'numeric' },
  '10': { name: 'BATCH', length: 'variable', type: 'alphanumeric', maxLength: 20 },
  '11': { name: 'PROD_DATE', length: 6, type: 'numeric', isDate: true },
  '17': { name: 'EXPIRY', length: 6, type: 'numeric', isDate: true },
  '21': { name: 'SERIAL', length: 'variable', type: 'alphanumeric', maxLength: 20 },
  '30': { name: 'COUNT', length: 'variable', type: 'numeric', maxLength: 8 },
  // '91': Removed - was causing false positives in batch parsing
};

/**
 * Known AIs for quick lookup
 */
const KNOWN_AIS = Object.keys(AI_DICTIONARY);

/**
 * Convert YYMMDD to YYYY-MM-DD with century inference
 * 00-49 → 2000-2049
 * 50-99 → 1950-1999
 */
function convertYYMMDDtoISO(yymmdd: string): { date: string; valid: boolean; error?: string } {
  if (yymmdd.length !== 6 || !/^\d{6}$/.test(yymmdd)) {
    return { date: '', valid: false, error: 'Invalid format (expected 6 digits)' };
  }
  
  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = parseInt(yymmdd.substring(2, 4), 10);
  const dd = parseInt(yymmdd.substring(4, 6), 10);
  
  // Century inference
  const yyyy = yy <= 49 ? 2000 + yy : 1900 + yy;
  
  // Month validation
  if (mm < 1 || mm > 12) {
    return { date: '', valid: false, error: `Invalid month: ${mm}` };
  }
  
  // Day validation (basic)
  if (dd < 1 || dd > 31) {
    return { date: '', valid: false, error: `Invalid day: ${dd}` };
  }
  
  // Days per month validation
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  // Leap year check
  const isLeapYear = (yyyy % 4 === 0 && yyyy % 100 !== 0) || (yyyy % 400 === 0);
  if (mm === 2 && isLeapYear) {
    daysInMonth[1] = 29;
  }
  
  if (dd > daysInMonth[mm - 1]) {
    return { 
      date: '', 
      valid: false, 
      error: `Invalid day ${dd} for month ${mm} (max ${daysInMonth[mm - 1]} days)` 
    };
  }
  
  // Format as YYYY-MM-DD
  const mmStr = mm.toString().padStart(2, '0');
  const ddStr = dd.toString().padStart(2, '0');
  const isoDate = `${yyyy}-${mmStr}-${ddStr}`;
  
  return { date: isoDate, valid: true };
}

export interface GS1ParseResult {
  fields: Record<string, string[]>;
  primary_gtin?: string;
  batch?: string;
  prod_date?: string; // AI 11 - Production date (ISO format)
  expiry?: string; // AI 17 - Expiry date (ISO format)
  serial?: string; // AI 21 - Serial number
  errors: Array<{
    position: number;
    ai: string;
    reason: string;
  }>;
  raw_tail?: string;
  raw: string;
}

export interface GS1ParseOptions {
  mode?: 'strict' | 'lenient';
  fnc1?: string; // FNC1 separator character (usually <GS> or special char)
}

/**
 * Validate if a segment matches the expected AI format
 */
function validateAISegment(
  ai: string,
  payload: string,
  spec: typeof AI_DICTIONARY[string]
): { valid: boolean; error?: string } {
  // Check length
  if (spec.length === 'variable') {
    const maxLen = spec.maxLength || 20;
    if (payload.length < 1 || payload.length > maxLen) {
      return { 
        valid: false, 
        error: `Length out of range (expected 1-${maxLen}, got ${payload.length})` 
      };
    }
  } else {
    if (payload.length !== spec.length) {
      return { 
        valid: false, 
        error: `Length mismatch (expected ${spec.length}, got ${payload.length})` 
      };
    }
  }

  // Check type
  if (spec.type === 'numeric') {
    if (!/^\d+$/.test(payload)) {
      return { valid: false, error: 'Expected numeric characters only' };
    }
  } else {
    // Alphanumeric
    if (!/^[A-Za-z0-9]+$/.test(payload)) {
      return { valid: false, error: 'Expected alphanumeric characters only' };
    }
  }

  return { valid: true };
}

/**
 * Find next valid AI candidate with lookahead validation
 * Returns: { ai, position } or null
 * 
 * Strategy: Only accept AI candidate if it has complete, valid payload
 * For date AIs (11, 17), validate calendar rules (month, day, leap year)
 * For variable-length AIs, check if payload can be parsed reasonably
 */
function findNextValidAI(
  barcode: string,
  startIndex: number,
  minDistance: number = 1,
  currentAI?: string
): { ai: string; position: number } | null {
  // Start searching from at least minDistance away
  const searchStart = startIndex + minDistance;
  
  for (let i = searchStart; i < barcode.length - 1; i++) {
    const candidate = barcode.substring(i, i + 2);
    
    if (!KNOWN_AIS.includes(candidate)) {
      continue; // Not a known AI, skip
    }
    
    const spec = AI_DICTIONARY[candidate];
    
    // ✅ CRITICAL: If current AI is same as candidate AI (e.g., both "10"),
    // this is likely false positive within payload - skip it unless context strongly suggests otherwise
    if (currentAI === candidate) {
      console.log(`[findNextValidAI] ⚠️ AI "${candidate}" at ${i}: same as current AI "${currentAI}", likely false positive - skipping`);
      continue;
    }
    
    // For fixed-length AI, validate payload length and format
    if (spec.length !== 'variable') {
      const requiredLength = spec.length as number;
      const availableLength = barcode.length - (i + 2);
      
      // Must have enough characters for full payload
      if (availableLength < requiredLength) {
        console.log(`[findNextValidAI] AI "${candidate}" at ${i}: not enough data (need ${requiredLength}, have ${availableLength})`);
        continue;
      }
      
      const payload = barcode.substring(i + 2, i + 2 + requiredLength);
      
      // Validate payload format
      const validation = validateAISegment(candidate, payload, spec);
      if (!validation.valid) {
        console.log(`[findNextValidAI] ❌ AI "${candidate}" at ${i}: invalid format "${payload}" - ${validation.error}`);
        continue;
      }
      
      // ✅ CRITICAL: Extra validation for DATE AIs (11, 17)
      if (spec.isDate) {
        const dateValidation = convertYYMMDDtoISO(payload);
        if (!dateValidation.valid) {
          console.log(`[findNextValidAI] ❌ AI "${candidate}" at ${i}: invalid date "${payload}" - ${dateValidation.error}`);
          continue; // Not a valid date, keep searching
        }
      }
      
      console.log(`[findNextValidAI] ✅ Valid fixed-length AI "${candidate}" found at position ${i}, payload: "${payload}"`);
      return { ai: candidate, position: i };
    } else {
      // ✅ For variable-length AI, check if it makes sense as next AI
      // Variable AI should have at least some reasonable payload before next AI
      const minPayload = 3; // Minimum reasonable payload for variable AI
      const payloadPreview = barcode.substring(i + 2, Math.min(i + 2 + minPayload, barcode.length));
      
      // Check if payload preview is valid for this AI type
      const spec = AI_DICTIONARY[candidate];
      const previewValidation = validateAISegment(candidate, payloadPreview, { ...spec, length: payloadPreview.length });
      
      if (!previewValidation.valid) {
        console.log(`[findNextValidAI] ❌ Variable AI "${candidate}" at ${i}: invalid payload preview "${payloadPreview}" - ${previewValidation.error}`);
        continue;
      }
      
      console.log(`[findNextValidAI] ✅ Valid variable-length AI "${candidate}" found at position ${i}`);
      return { ai: candidate, position: i };
    }
  }
  
  return null;
}

/**
 * Parse GS1 barcode string
 */
export function parseGS1Barcode(
  barcode: string,
  options: GS1ParseOptions = {}
): GS1ParseResult {
  const { mode = 'lenient', fnc1 } = options;
  
  // ✅ CRITICAL: Clean barcode - remove non-ASCII characters (Korean, special chars)
  const cleanedBarcode = barcode.replace(/[^\x20-\x7E]/g, '');
  
  if (cleanedBarcode !== barcode) {
    console.warn('[gs1Parser] ⚠️ Removed non-ASCII characters from barcode');
    console.warn('[gs1Parser] Original:', barcode);
    console.warn('[gs1Parser] Cleaned:', cleanedBarcode);
  }
  
  const result: GS1ParseResult = {
    fields: {},
    errors: [],
    raw: cleanedBarcode,
  };
  
  let currentIndex = 0;
  
  console.log('[gs1Parser] Starting parse:', cleanedBarcode);
  console.log('[gs1Parser] Mode:', mode);
  
  while (currentIndex < cleanedBarcode.length - 1) {
    const ai = cleanedBarcode.substring(currentIndex, currentIndex + 2);
    
    // Check if this is a known AI
    if (!KNOWN_AIS.includes(ai)) {
      console.warn(`[gs1Parser] Unknown AI "${ai}" at position ${currentIndex}`);
      result.errors.push({
        position: currentIndex,
        ai,
        reason: 'Unknown AI',
      });
      
      if (mode === 'strict') {
        result.raw_tail = cleanedBarcode.substring(currentIndex);
        break;
      }
      
      // Skip 2 characters and continue
      currentIndex += 2;
      continue;
    }
    
    const spec = AI_DICTIONARY[ai];
    console.log(`[gs1Parser] Found AI "${ai}" (${spec.name}) at position ${currentIndex}`);
    
    // Parse payload
    let payload: string = '';
    let payloadEnd: number = currentIndex + 2;
    
    if (spec.length === 'variable') {
      // Variable-length: find end by FNC1 or next valid AI
      const payloadStart = currentIndex + 2;
      const maxEnd = Math.min(
        payloadStart + (spec.maxLength || 20),
        cleanedBarcode.length
      );
      
      // Check for FNC1
      let fnc1Index = -1;
      if (fnc1) {
        fnc1Index = cleanedBarcode.indexOf(fnc1, payloadStart);
        if (fnc1Index !== -1 && fnc1Index < maxEnd) {
          payload = cleanedBarcode.substring(payloadStart, fnc1Index);
          payloadEnd = fnc1Index + 1; // Skip FNC1
          console.log(`[gs1Parser] Found FNC1 at ${fnc1Index}, payload: "${payload}"`);
        }
      }
      
      // If no FNC1, use lookahead for next valid AI
      if (fnc1Index === -1) {
        // Strategy: Variable-length AI should be greedy by default
        // Only stop if we find a VALID next AI with complete payload
        
        // Try different search distances to find the best match
        let bestNextAI = null;
        let bestPayload = null;
        
        // Start with minimum distance and increase
        for (let searchDist = 3; searchDist <= Math.min(10, cleanedBarcode.length - payloadStart); searchDist++) {
          const nextAI = findNextValidAI(cleanedBarcode, payloadStart, searchDist, ai); // Pass current AI
          
          if (nextAI && nextAI.position < maxEnd) {
            // Found a valid next AI
            bestNextAI = nextAI;
            bestPayload = cleanedBarcode.substring(payloadStart, nextAI.position);
            console.log(`[gs1Parser] Candidate next AI "${nextAI.ai}" at ${nextAI.position}, would give payload: "${bestPayload}"`);
            break; // Use first valid match
          }
        }
        
        if (bestNextAI && bestPayload) {
          payload = bestPayload;
          payloadEnd = bestNextAI.position;
          console.log(`[gs1Parser] Found next AI "${bestNextAI.ai}" at ${bestNextAI.position}, payload: "${payload}"`);
        } else {
          // No valid next AI found, take remaining up to maxLength
          payload = cleanedBarcode.substring(payloadStart, maxEnd);
          payloadEnd = maxEnd;
          console.log(`[gs1Parser] No valid next AI found, taking remaining payload: "${payload}"`);
        }
      }
    } else {
      // Fixed-length
      payload = cleanedBarcode.substring(currentIndex + 2, currentIndex + 2 + spec.length);
      payloadEnd = currentIndex + 2 + spec.length;
      console.log(`[gs1Parser] Fixed-length payload: "${payload}"`);
    }
    
    // Validate payload
    const validation = validateAISegment(ai, payload, spec);
    if (!validation.valid) {
      console.error(`[gs1Parser] Invalid payload for AI "${ai}": "${payload}" - ${validation.error}`);
      result.errors.push({
        position: currentIndex,
        ai,
        reason: validation.error || 'Invalid format',
      });
      
      if (mode === 'strict') {
        result.raw_tail = barcode.substring(currentIndex);
        break;
      }
      
      // Skip this AI and continue
      currentIndex += 2;
      continue;
    }
    
    // Store parsed field
    if (!result.fields[ai]) {
      result.fields[ai] = [];
    }

    // Date conversion if needed
    if (spec.isDate) {
      const converted = convertYYMMDDtoISO(payload);
      if (!converted.valid) {
        console.error(`[gs1Parser] Date validation failed for AI "${ai}": "${payload}" - ${converted.error}`);
        result.errors.push({
          position: currentIndex,
          ai,
          reason: `Date validation failed: ${converted.error}`,
        });
        result.fields[ai].push(payload); // Store raw value
      } else {
        result.fields[ai].push(converted.date); // Store ISO date
        console.log(`[gs1Parser] ✅ Parsed AI "${ai}": "${payload}" → "${converted.date}"`);
        
        // Set primary shortcuts
        if (ai === '11' && !result.prod_date) {
          result.prod_date = converted.date;
        } else if (ai === '17' && !result.expiry) {
          result.expiry = converted.date;
        }
      }
    } else {
      // Non-date fields
      result.fields[ai].push(payload);
      console.log(`[gs1Parser] ✅ Parsed AI "${ai}": "${payload}"`);

      // Set primary shortcuts for non-date fields
      if (ai === '01' && !result.primary_gtin) {
        result.primary_gtin = payload;
      } else if (ai === '10' && !result.batch) {
        result.batch = payload;
      } else if (ai === '21' && !result.serial) {
        result.serial = payload;
      }
    }
    
    // Move to next segment
    currentIndex = payloadEnd;
  }
  
  // Check for unparsed tail
  if (currentIndex < cleanedBarcode.length) {
    const tail = cleanedBarcode.substring(currentIndex);
    if (tail.length > 0) {
      console.warn(`[gs1Parser] Unparsed tail: "${tail}"`);
      result.raw_tail = tail;
      
      // Try to identify if it looks like an invalid AI
      if (tail.length >= 2) {
        const possibleAI = tail.substring(0, 2);
        if (KNOWN_AIS.includes(possibleAI)) {
          result.errors.push({
            position: currentIndex,
            ai: possibleAI,
            reason: 'Incomplete or invalid segment',
          });
        }
      }
    }
  }
  
  console.log('[gs1Parser] Parse complete:', {
    fields: result.fields,
    primary_gtin: result.primary_gtin,
    batch: result.batch,
    prod_date: result.prod_date,
    expiry: result.expiry,
    errors: result.errors,
    raw_tail: result.raw_tail,
  });
  
  return result;
}

/**
 * Backward compatibility - returns simple format
 */
export interface GS1BarcodeData {
  gtin?: string;
  expiryDate?: string;
  batchNumber?: string;
  serialNumber?: string;
  productionDate?: string; // AI 11
  rawBarcode: string;
}

export function parseGS1BarcodeCompat(barcode: string): GS1BarcodeData {
  const parsed = parseGS1Barcode(barcode, { mode: 'lenient' });
  
  return {
    gtin: parsed.primary_gtin,
    expiryDate: parsed.expiry,
    batchNumber: parsed.batch,
    serialNumber: parsed.serial,
    productionDate: parsed.prod_date,
    rawBarcode: barcode,
  };
}
