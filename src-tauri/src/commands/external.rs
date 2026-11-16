use std::process::Command;

#[tauri::command]
pub(crate) fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("Só links HTTP, HTTPS ou mailto podem ser abertos externamente.".into());
    }
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Não foi possível abrir o link: {error}"))
}
