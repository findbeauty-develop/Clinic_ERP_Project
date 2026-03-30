//! macOS: avoid `UNUserNotificationCenter` + nested `NSRunLoop` inside Tauri’s event loop — that
//! combination commonly crashes the process (`SIGABRT` on main). Use `osascript display notification`
//! instead (same mechanism many utilities use); no ObjC blocks or run-loop pumping here.

use std::io::Read;
use std::process::{Command, Stdio};

fn applescript_string_literal(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push(' '),
            '\r' => {}
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn show(title: &str, body: &str) -> Result<(), String> {
    let title_lit = applescript_string_literal(title);
    let body_lit = applescript_string_literal(body);
    let source = format!("display notification {body_lit} with title {title_lit}");

    let mut child = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&source)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("osascript spawn: {e}"))?;

    let mut stderr = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr);
    }

    let status = child
        .wait()
        .map_err(|e| format!("osascript wait: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        let tail = stderr.trim();
        if tail.is_empty() {
            Err(format!("osascript failed (status {status})"))
        } else {
            Err(format!("osascript: {tail}"))
        }
    }
}
