use std::process::Command;

#[tauri::command]
pub(crate) fn open_external(url: String) -> Result<(), String> {
    let scheme = url
        .split_once(':')
        .map(|(scheme, _)| scheme.to_ascii_lowercase());
    if !matches!(scheme.as_deref(), Some("http" | "https" | "mailto")) {
        return Err("Só links HTTP, HTTPS ou mailto podem ser abertos externamente.".into());
    }
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Não foi possível abrir o link: {error}"))
}
