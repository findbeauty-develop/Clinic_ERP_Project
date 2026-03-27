use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
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
