import Foundation
import IOKit
import IOKit.hid
import Network

// MARK: - Scanner service (HID capture + buffer)

final class ScannerService {
    private var buffer = ""
    private(set) var lastBarcode: String = ""
    private(set) var lastScannedAt: TimeInterval = 0
    private let queue = DispatchQueue(label: "scanner.buffer")
    var onBarcodeScanned: ((String) -> Void)?

    func handleInput(valueRef: IOHIDValue) {
        let element = IOHIDValueGetElement(valueRef)
        let usagePage = IOHIDElementGetUsagePage(element)
        let usage = IOHIDElementGetUsage(element)
        let intValue = IOHIDValueGetIntegerValue(valueRef)

        guard usagePage == 0x07 else { return }  // Keyboard usage page
        guard intValue == 1 else { return }       // Key down only

        if USKeyboardMap.isEnter(usage: usage) {
            queue.async { [weak self] in
                guard let self = self else { return }
                let barcode = self.buffer
                self.buffer = ""
                if !barcode.isEmpty {
                    DispatchQueue.main.async {
                        self.lastBarcode = barcode
                        self.lastScannedAt = Date().timeIntervalSince1970
                        self.onBarcodeScanned?(barcode)
                    }
                }
            }
            return
        }

        if let char = USKeyboardMap.character(forUsage: usage) {
            queue.async { [weak self] in
                self?.buffer.append(char)
            }
        }
    }
}

// C callback for IOHIDManager
private func hidValueCallback(
    context: UnsafeMutableRawPointer?,
    result: IOReturn,
    sender: UnsafeMutableRawPointer?,
    value: IOHIDValue
) {
    guard result == kIOReturnSuccess, let context = context else { return }
    let service = Unmanaged<ScannerService>.fromOpaque(context).takeUnretainedValue()
    service.handleInput(valueRef: value)
}

// MARK: - SSE clients (push only when scan happens)

final class SSEClients {
    private var connections: [NWConnection] = []
    private let queue = DispatchQueue(label: "sse.clients")

    func add(_ conn: NWConnection) {
        queue.async { [weak self] in
            self?.connections.append(conn)
        }
    }

    func remove(_ conn: NWConnection) {
        queue.async { [weak self] in
            self?.connections.removeAll { $0 === conn }
        }
    }

    func broadcast(barcode: String, scannedAt: TimeInterval) {
        let escaped = barcode.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let payload = "data: {\"barcode\":\"\(escaped)\",\"scannedAt\":\(Int(scannedAt))}\n\n"
        guard let data = payload.data(using: .utf8) else { return }
        queue.async { [weak self] in
            guard let self = self else { return }
            for conn in self.connections {
                conn.send(content: data, completion: .contentProcessed { _ in })
            }
        }
    }
}

// MARK: - HTTP server (GET /barcode one-shot, GET /events SSE push on scan)

func runHTTPServer(port: UInt16, getLastBarcode: @escaping () -> String, getLastScannedAt: @escaping () -> TimeInterval, sseClients: SSEClients) {
    let listener = try! NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
    listener.stateUpdateHandler = { state in
        if case .ready = state {
            print("Barcode helper: http://127.0.0.1:\(port)/barcode (one-shot) and /events (SSE, push on scan)")
        }
    }
    listener.newConnectionHandler = { conn in
        conn.start(queue: .main)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, _, _ in
            guard let data = data, !data.isEmpty,
                  let request = String(data: data, encoding: .utf8)
            else {
                conn.cancel()
                return
            }
            if request.hasPrefix("OPTIONS ") {
                let response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nConnection: close\r\n\r\n"
                conn.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in conn.cancel() })
                return
            }
            guard request.hasPrefix("GET ") else {
                conn.cancel()
                return
            }
            let path = request.split(separator: " ")[1].split(separator: "?")[0]
            let pathStr = String(path)

            if pathStr == "/events" || pathStr.hasSuffix("/events") {
                let headers = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n"
                conn.send(content: headers.data(using: .utf8), completion: .contentProcessed { _ in })
                sseClients.add(conn)
                conn.stateUpdateHandler = { state in
                    if case .cancelled = state { sseClients.remove(conn) }
                    if case .failed = state { sseClients.remove(conn) }
                }
                return
            }

            let barcode = getLastBarcode()
            let scannedAt = getLastScannedAt()
            let body = "{\"barcode\":\"\(barcode.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\",\"scannedAt\":\(Int(scannedAt))}\n"
            let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
            conn.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in conn.cancel() })
        }
    }
    listener.start(queue: .main)
}

// MARK: - Main

func main() {
    let scannerVendorID: Int = 9969
    let scannerProductID: Int = 34817
    let httpPort: UInt16 = 38473

    let service = ScannerService()

    let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
    let matchDict = [kIOHIDVendorIDKey: scannerVendorID, kIOHIDProductIDKey: scannerProductID] as CFDictionary
    IOHIDManagerSetDeviceMatching(manager, matchDict)

    let context = Unmanaged.passUnretained(service).toOpaque()
    IOHIDManagerRegisterInputValueCallback(manager, hidValueCallback, context)
    IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    let openResult = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
    if openResult != kIOReturnSuccess {
        print("Could not open HID manager (is scanner connected?): \(openResult)")
    } else {
        print("Scanner attached (VID \(scannerVendorID) PID \(scannerProductID)). Scan a barcode.")
    }

    let sseClients = SSEClients()
    runHTTPServer(port: httpPort, getLastBarcode: { service.lastBarcode }, getLastScannedAt: { service.lastScannedAt }, sseClients: sseClients)

    service.onBarcodeScanned = { barcode in
        print("Scanned: \(barcode)")
        sseClients.broadcast(barcode: barcode, scannedAt: service.lastScannedAt)
    }

    CFRunLoopRun()
}

main()
