/**
 * GS1 Barcode Parser (Backward Compatibility Wrapper)
 * 
 * This file now wraps the new production-level GS1 parser.
 * Use gs1Parser.ts for new code.
 */

export { 
  parseGS1BarcodeCompat as parseGS1Barcode,
  type GS1BarcodeData 
} from './gs1Parser';
export { isValidGTIN, isValidDate } from './gs1ParserValidators';
