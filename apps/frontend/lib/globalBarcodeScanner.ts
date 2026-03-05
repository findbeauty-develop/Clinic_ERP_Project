/**
 * Global Barcode Scanner (IME/Hangul-safe, Focus-free)
 * 
 * Features:
 * - Layout-independent: Uses event.code instead of event.key
 * - Works globally: No focus required
 * - Uppercase only: Perfect for LOT numbers
 * - Smart detection: Differentiates scanner from manual typing
 * - Timeout support: Works with or without Enter suffix
 * 
 * @author Clinic ERP Team
 * @version 2.0.0
 */

interface ScannerConfig {
  onScan: (barcode: string) => void;
  minLen?: number;
  maxIntervalMs?: number;
  fastStartCount?: number;
  endKey?: string;
  allowInInputs?: boolean;
  useTimeout?: boolean;
  completionTimeoutMs?: number;
  debug?: boolean;
}

class GlobalBarcodeScanner {
  private buffer: string = '';
  private lastTs: number = 0;
  private fastCount: number = 0;
  private scanStarted: boolean = false;
  private resetTimer: NodeJS.Timeout | null = null;
  private completionTimer: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  
  private config: Required<ScannerConfig> = {
    onScan: () => {},
    minLen: 6,
    maxIntervalMs: 80,
    fastStartCount: 3,
    endKey: 'Enter',
    allowInInputs: true,
    useTimeout: true,
    completionTimeoutMs: 120,
    debug: false,
  };

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Start global barcode scanning
   */
  start(options: ScannerConfig): void {
    if (this.isActive) {
      console.warn('⚠️ GlobalBarcodeScanner already active');
      return;
    }

    if (typeof options.onScan !== 'function') {
      throw new Error('onScan callback is required');
    }

    this.config = { ...this.config, ...options };
    this.isActive = true;
    this._hardReset();

    // Add global listener with capture phase
    document.addEventListener('keydown', this.handleKeyDown, true);

    if (this.config.debug) {
      console.log('✅ GlobalBarcodeScanner started', {
        minLen: this.config.minLen,
        maxIntervalMs: this.config.maxIntervalMs,
        useTimeout: this.config.useTimeout,
        completionTimeoutMs: this.config.completionTimeoutMs,
      });
    }
  }

  /**
   * Stop global barcode scanning
   */
  stop(): void {
    if (!this.isActive) return;

    document.removeEventListener('keydown', this.handleKeyDown, true);
    this.isActive = false;
    this._hardReset();

    if (this.config.debug) {
      console.log('🛑 GlobalBarcodeScanner stopped');
    }
  }

  /**
   * Handle keydown events globally
   */
  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    // Skip if in editable field and not allowed
    if (!this.config.allowInInputs && this._isEditableTarget(e.target)) {
      return;
    }

    // Ignore modifier keys
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    // Ignore utility keys
    if (this._isIgnorableCode(e.code)) {
      return;
    }

    const now = performance.now();
    const dt = this.lastTs ? now - this.lastTs : 0;
    this.lastTs = now;

    // Too slow = manual typing, reset buffer
    if (dt && dt > this.config.maxIntervalMs) {
      this._softReset();
    }

    // Handle Enter key (scan completion)
    if (e.code === this.config.endKey || e.key === this.config.endKey) {
      if (this.scanStarted && this.buffer.length >= this.config.minLen) {
        const code = this.buffer;
        this._hardReset();

        // Prevent default Enter behavior
        e.preventDefault();
        e.stopPropagation();

        if (this.config.debug) {
          console.log('✅ Scan complete (Enter):', code);
        }

        this.config.onScan(code);
      } else {
        this._softReset();
      }
      return;
    }

    // Convert code to ASCII character
    const ch = this._codeToAscii(e.code);
    if (!ch) {
      // Invalid character
      if (this.scanStarted) {
        this._softReset();
      }
      return;
    }

    // Speed-based scanner detection
    if (dt && dt <= this.config.maxIntervalMs) {
      this.fastCount += 1;
    } else {
      this.fastCount = 1;
    }

    this.buffer += ch;

    // Start scan if fast typing detected
    if (!this.scanStarted && this.fastCount >= this.config.fastStartCount) {
      this.scanStarted = true;
      if (this.config.debug) {
        console.log('🎬 Scan started!');
      }
    }

    // Only prevent default after scan started
    if (this.scanStarted) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (this.config.debug) {
      console.log(`📷 Buffer: "${this.buffer}" (${this.buffer.length} chars, ${this.fastCount} fast)`);
    }

    // Arm timers
    this._armTimers();
  }

  /**
   * Arm both reset and completion timers
   */
  private _armTimers(): void {
    // Clear existing timers
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.completionTimer) clearTimeout(this.completionTimer);

    // Reset timer (safety net)
    this.resetTimer = setTimeout(() => {
      if (this.config.debug) {
        console.log('⏱️ Reset timeout - buffer cleared');
      }
      this._softReset();
    }, this.config.maxIntervalMs * 3);

    // Completion timer (auto-complete without Enter)
    if (this.config.useTimeout && this.scanStarted) {
      this.completionTimer = setTimeout(() => {
        if (this.buffer.length >= this.config.minLen) {
          const code = this.buffer;
          this._hardReset();

          if (this.config.debug) {
            console.log('✅ Scan complete (Timeout):', code);
          }

          this.config.onScan(code);
        } else {
          if (this.config.debug) {
            console.log('⚠️ Buffer too short, cleared:', this.buffer);
          }
          this._softReset();
        }
      }, this.config.completionTimeoutMs);
    }
  }

  /**
   * Soft reset: Clear buffer and state
   */
  private _softReset(): void {
    this.buffer = '';
    this.fastCount = 0;
    this.scanStarted = false;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }
  }

  /**
   * Hard reset: Full state reset
   */
  private _hardReset(): void {
    this._softReset();
    this.lastTs = 0;
  }

  /**
   * Check if target is editable element
   */
  private _isEditableTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }

  /**
   * Check if key code should be ignored
   */
  private _isIgnorableCode(code: string): boolean {
    return (
      code === 'ShiftLeft' ||
      code === 'ShiftRight' ||
      code === 'CapsLock' ||
      code === 'Tab' ||
      code === 'Escape'
    );
  }

  /**
   * Convert event.code to ASCII character (UPPERCASE only)
   */
  private _codeToAscii(code: string): string {
    // Letters: KeyA..KeyZ → A..Z (UPPERCASE)
    if (/^Key[A-Z]$/.test(code)) {
      return code.slice(3); // KeyA → A, KeyB → B
    }

    // Digits: Digit0..Digit9 → 0..9
    if (/^Digit\d$/.test(code)) {
      return code.slice(5); // Digit0 → 0
    }

    // Numpad: Numpad0..Numpad9 → 0..9
    if (/^Numpad\d$/.test(code)) {
      return code.slice(6); // Numpad0 → 0
    }

    // Special characters (common in barcodes)
    const specials: Record<string, string> = {
      Minus: '-',
      NumpadSubtract: '-',
      Slash: '/',
      NumpadDivide: '/',
      Period: '.',
      NumpadDecimal: '.',
    };

    return specials[code] || '';
  }

  /**
   * Get current scanner state (for debugging)
   */
  getState(): {
    buffer: string;
    scanStarted: boolean;
    fastCount: number;
    isActive: boolean;
    bufferLength: number;
  } {
    return {
      buffer: this.buffer,
      scanStarted: this.scanStarted,
      fastCount: this.fastCount,
      isActive: this.isActive,
      bufferLength: this.buffer.length,
    };
  }

  /**
   * Check if scanner is active
   */
  isScanning(): boolean {
    return this.isActive;
  }
}

// Create and export singleton instance
const globalBarcodeScanner = new GlobalBarcodeScanner();

export default globalBarcodeScanner;
