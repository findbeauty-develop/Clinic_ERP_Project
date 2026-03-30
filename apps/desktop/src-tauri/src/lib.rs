use serde::Deserialize;
use tauri::Listener;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeNotifyPayload {
    title: String,
    body: String,
}

/// Settings “test notification” — `invoke` / postMessage IPC.
#[tauri::command]
fn show_native_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![show_native_notification])
        .setup(|app| {
            let notify_app = app.handle().clone();
            app.listen("native-notification", move |event| {
                let Ok(payload) = serde_json::from_str::<NativeNotifyPayload>(event.payload()) else {
                    return;
                };
                let _ = notify_app
                    .notification()
                    .builder()
                    .title(payload.title)
                    .body(payload.body)
                    .show();
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
                            let _ = app
                                .notification()
                                .builder()
                                .title("Jaclit ERP")
                                .body("Test notification — app is running in the background (tray).")
                                .show();
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
