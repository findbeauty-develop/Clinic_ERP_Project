/**
 * React Hook for Global Barcode Scanner
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   useGlobalBarcodeScanner((barcode) => {
 *     console.log('Scanned:', barcode);
 *   }, {
 *     minLen: 8,
 *     debug: true,
 *   });
 * 
 *   return <div>Scanner active!</div>;
 * }
 * ```
 */

import { useEffect, useCallback, useState } from 'react';
import globalBarcodeScanner from '../lib/globalBarcodeScanner';

interface UseBarcodeScannerOptions {
  minLen?: number;
  maxIntervalMs?: number;
  useTimeout?: boolean;
  completionTimeoutMs?: number;
  debug?: boolean;
  enabled?: boolean; // Enable/disable scanner dynamically
}

/**
 * Hook for global barcode scanning
 */
export function useGlobalBarcodeScanner(
  onScan: (barcode: string) => void,
  options: UseBarcodeScannerOptions = {}
) {
  const {
    minLen = 6,
    maxIntervalMs = 80,
    useTimeout = true,
    completionTimeoutMs = 120,
    debug = false,
    enabled = true,
  } = options;

  // Stable callback reference
  const stableOnScan = useCallback(onScan, []);

  useEffect(() => {
    if (!enabled) return;

    globalBarcodeScanner.start({
      onScan: stableOnScan,
      minLen,
      maxIntervalMs,
      useTimeout,
      completionTimeoutMs,
      debug,
      allowInInputs: true,
      fastStartCount: 3,
      endKey: 'Enter',
    });

    return () => {
      globalBarcodeScanner.stop();
    };
  }, [stableOnScan, minLen, maxIntervalMs, useTimeout, completionTimeoutMs, debug, enabled]);
}

/**
 * Hook with scan mode toggle (button-based control)
 */
export function useToggleableScanner(
  onScan: (barcode: string) => void,
  options: UseBarcodeScannerOptions = {}
) {
  const [isActive, setIsActive] = useState(false);

  useGlobalBarcodeScanner(onScan, {
    ...options,
    enabled: isActive,
  });

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

  const start = useCallback(() => {
    setIsActive(true);
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
  }, []);

  return {
    isActive,
    toggle,
    start,
    stop,
  };
}
