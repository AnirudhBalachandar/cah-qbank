#!/usr/bin/env swift

import AppKit
import Foundation

struct IconSlot {
    let filename: String
    let pixels: Int
}

let iconSlots = [
    IconSlot(filename: "appicon-iphone-20@2x.png", pixels: 40),
    IconSlot(filename: "appicon-iphone-20@3x.png", pixels: 60),
    IconSlot(filename: "appicon-iphone-29@2x.png", pixels: 58),
    IconSlot(filename: "appicon-iphone-29@3x.png", pixels: 87),
    IconSlot(filename: "appicon-iphone-40@2x.png", pixels: 80),
    IconSlot(filename: "appicon-iphone-40@3x.png", pixels: 120),
    IconSlot(filename: "appicon-iphone-60@2x.png", pixels: 120),
    IconSlot(filename: "appicon-iphone-60@3x.png", pixels: 180),
    IconSlot(filename: "appicon-mac-16@1x.png", pixels: 16),
    IconSlot(filename: "appicon-mac-16@2x.png", pixels: 32),
    IconSlot(filename: "appicon-mac-32@1x.png", pixels: 32),
    IconSlot(filename: "appicon-mac-32@2x.png", pixels: 64),
    IconSlot(filename: "appicon-mac-128@1x.png", pixels: 128),
    IconSlot(filename: "appicon-mac-128@2x.png", pixels: 256),
    IconSlot(filename: "appicon-mac-256@1x.png", pixels: 256),
    IconSlot(filename: "appicon-mac-256@2x.png", pixels: 512),
    IconSlot(filename: "appicon-mac-512@1x.png", pixels: 512),
    IconSlot(filename: "appicon-mac-512@2x.png", pixels: 1024),
    IconSlot(filename: "appicon-ios-marketing-1024.png", pixels: 1024),
]

let scriptURL = URL(fileURLWithPath: #filePath)
let projectRoot = scriptURL.deletingLastPathComponent().deletingLastPathComponent()
let outputDirectory = projectRoot
    .appendingPathComponent("Resources", isDirectory: true)
    .appendingPathComponent("Assets.xcassets", isDirectory: true)
    .appendingPathComponent("AppIcon.appiconset", isDirectory: true)

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

for slot in iconSlots {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: slot.pixels,
        pixelsHigh: slot.pixels,
        bitsPerSample: 8,
        samplesPerPixel: 3,
        hasAlpha: false,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fatalError("Unable to allocate bitmap for \(slot.filename)")
    }

    bitmap.size = NSSize(width: slot.pixels, height: slot.pixels)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSGraphicsContext.current?.imageInterpolation = .high
    drawIcon(size: CGFloat(slot.pixels))
    NSGraphicsContext.restoreGraphicsState()

    guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Unable to render \(slot.filename)")
    }

    try pngData.write(to: outputDirectory.appendingPathComponent(slot.filename))
}

print("Generated \(iconSlots.count) app icon files in \(outputDirectory.path)")

private func drawIcon(size: CGFloat) {
    let canvas = NSRect(x: 0, y: 0, width: size, height: size)
    NSColor(calibratedRed: 0.04, green: 0.12, blue: 0.22, alpha: 1).setFill()
    NSBezierPath(rect: canvas).fill()

    let topBand = NSRect(x: 0, y: size * 0.56, width: size, height: size * 0.44)
    NSColor(calibratedRed: 0.05, green: 0.36, blue: 0.36, alpha: 1).setFill()
    NSBezierPath(roundedRect: topBand, xRadius: size * 0.22, yRadius: size * 0.22).fill()

    let card = NSRect(x: size * 0.17, y: size * 0.18, width: size * 0.66, height: size * 0.58)
    NSColor(calibratedWhite: 0.98, alpha: 1).setFill()
    NSBezierPath(roundedRect: card, xRadius: size * 0.08, yRadius: size * 0.08).fill()

    NSColor(calibratedRed: 0.13, green: 0.52, blue: 0.49, alpha: 1).setStroke()
    let checkPath = NSBezierPath()
    checkPath.lineWidth = max(1, size * 0.05)
    checkPath.lineCapStyle = .round
    checkPath.lineJoinStyle = .round
    checkPath.move(to: NSPoint(x: size * 0.27, y: size * 0.46))
    checkPath.line(to: NSPoint(x: size * 0.39, y: size * 0.35))
    checkPath.line(to: NSPoint(x: size * 0.61, y: size * 0.58))
    checkPath.stroke()

    let label = "CAH"
    let font = NSFont.systemFont(ofSize: size * 0.16, weight: .bold)
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(calibratedRed: 0.04, green: 0.12, blue: 0.22, alpha: 1),
    ]
    let textSize = label.size(withAttributes: attributes)
    let textPoint = NSPoint(x: (size - textSize.width) / 2, y: size * 0.22)
    label.draw(at: textPoint, withAttributes: attributes)
}
