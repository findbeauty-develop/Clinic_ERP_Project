#[cfg(not(target_os = "macos"))]
use notify_rust::Notification;
use tauri::Listener;
use tauri::Manager;
use tauri::Runtime;

#[cfg(target_os = "macos")]
mod macos_notify;

fn show_os_notification(title: &str, body: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_notify::show(title, body)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut n = Notification::new();
        n.summary(title);
        n.body(body);
        n.show()
            .map_err(|e| e.to_string())
            .map(|_| ())
    }
}

/// macOS: `osascript` does not require the AppKit main thread; avoid blocking it from `invoke`.
#[cfg(target_os = "macos")]
fn show_os_notification_on_main<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    title: String,
    body: String,
) -> Result<(), String> {
    show_os_notification(&title, &body)
}

#[cfg(not(target_os = "macos"))]
fn show_os_notification_on_main<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    title: String,
    body: String,
) -> Result<(), String> {
    show_os_notification(&title, &body)
}

/// Web → Rust (postMessage IPC). No tauri-plugin-notification (avoids injected ipc:// guest script on HTTPS).
#[tauri::command]
fn show_native_notification<R: Runtime>(
    app: tauri::AppHandle<R>,
    title: String,
    body: String,
) -> Result<(), String> {
    show_os_notification_on_main(&app, title, body)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![show_native_notification])
        .setup(|app| {
            let app_h = app.handle().clone();
            app.listen("native-notification", move |event| {
                let Ok(v) = serde_json::from_str::<serde_json::Value>(event.payload()) else {
                    return;
                };
                let title = v
                    .get("title")
                    .and_then(|t| t.as_str())
                    .unwrap_or("Jaclit ERP");
                let body = v
                    .get("body")
                    .and_then(|b| b.as_str())
                    .unwrap_or(" ");
                let _ = show_os_notification_on_main(
                    &app_h,
                    title.to_string(),
                    body.to_string(),
                );
            });

            let open = tauri::menu::MenuItem::with_id(
                app,
                "tray_open",
                "Open / Show",
                true,
                None::<&str>,
            )?;
            let test_notif = tauri::menu::MenuItem::with_id(
                app,
                "tray_test_notification",
                "Test notification",
                true,
                None::<&str>,
            )?;
            let quit = tauri::menu::MenuItem::with_id(
                app,
                "tray_quit",
                "Quit",
                true,
                None::<&str>,
            )?;

            let menu = tauri::menu::Menu::with_items(app, &[&open, &test_notif, &quit])?;

            let tray_icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "default window icon missing — run `pnpm desktop:icon <path-to.png>` from repo root",
                )
            })?;

            let mut tray_builder = tauri::tray::TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Jaclit ERP")
                .icon(tray_icon);

            #[cfg(target_os = "macos")]
            {
                tray_builder = tray_builder.show_menu_on_left_click(true);
                tray_builder = tray_builder.icon_as_template(false);
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "tray_open" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "tray_test_notification" => {
                            let _ = show_os_notification_on_main(
                                &app,
                                "Jaclit ERP".to_string(),
                                "Test notification — app is running in the background (tray)."
                                    .to_string(),
                            );
                        }
                        "tray_quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            let window = app
                .get_webview_window("main")
                .expect("main webview window must exist");

            #[cfg(debug_assertions)]
            {
                let _ = window.open_devtools();
            }

            let main_for_close = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = main_for_close.hide();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri ilovasini ishga tushirib bo'lmadi");
}
