import Foundation

/// HID Usage Page 0x07 (Keyboard) — US layout mapping.
/// Used so scanner input is always interpreted as US, regardless of system input source (e.g. Hangul).
enum USKeyboardMap {
    private static let map: [UInt32: String] = [
        0x04: "A", 0x05: "B", 0x06: "C", 0x07: "D", 0x08: "E",
        0x09: "F", 0x0A: "G", 0x0B: "H", 0x0C: "I", 0x0D: "J",
        0x0E: "K", 0x0F: "L", 0x10: "M", 0x11: "N", 0x12: "O",
        0x13: "P", 0x14: "Q", 0x15: "R", 0x16: "S", 0x17: "T",
        0x18: "U", 0x19: "V", 0x1A: "W", 0x1B: "X", 0x1C: "Y",
        0x1D: "Z",
        0x1E: "1", 0x1F: "2", 0x20: "3", 0x21: "4", 0x22: "5",
        0x23: "6", 0x24: "7", 0x25: "8", 0x26: "9", 0x27: "0",
        0x2C: " ", 0x2D: "-", 0x2E: "=", 0x2F: "[", 0x30: "]",
        0x31: "\\", 0x33: ";", 0x34: "'", 0x35: "`", 0x36: ",",
        0x37: ".", 0x38: "/",
    ]

    /// Enter key — end of scan
    static let usageEnter: UInt32 = 0x28

    /// Returns US character for HID usage (key down), or nil if not mapped / should ignore.
    static func character(forUsage usage: UInt32) -> String? {
        map[usage]
    }

    static func isEnter(usage: UInt32) -> Bool {
        usage == usageEnter
    }
}
