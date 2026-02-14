use std::process::{Child, Command};
use std::sync::Mutex;

struct GatekeeperState {
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn start_gatekeeper(state: tauri::State<GatekeeperState>) -> Result<String, String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;

    if guard.is_some() {
        return Err("gatekeeper already running".into());
    }

    let child = Command::new("bun")
        .arg("run")
        .arg("gatekeeper/src/index.ts")
        .spawn()
        .map_err(|e| format!("failed to spawn gatekeeper: {}", e))?;

    let pid = child.id();
    *guard = Some(child);

    Ok(format!("gatekeeper started (pid {})", pid))
}

#[tauri::command]
fn stop_gatekeeper(state: tauri::State<GatekeeperState>) -> Result<String, String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;

    match guard.take() {
        Some(mut child) => {
            child.kill().map_err(|e| format!("failed to kill gatekeeper: {}", e))?;
            child.wait().map_err(|e| format!("failed to wait on gatekeeper: {}", e))?;
            Ok("gatekeeper stopped".into())
        }
        None => Err("gatekeeper not running".into()),
    }
}

#[tauri::command]
fn gatekeeper_status(state: tauri::State<GatekeeperState>) -> Result<String, String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;

    match guard.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(_status)) => {
                *guard = None;
                Ok("stopped".into())
            }
            Ok(None) => Ok("running".into()),
            Err(e) => Err(format!("error checking status: {}", e)),
        },
        None => Ok("stopped".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(GatekeeperState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_gatekeeper,
            stop_gatekeeper,
            gatekeeper_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
