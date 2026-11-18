mod commands;
mod state;

use state::LaunchTargets;

pub fn run() {
    tauri::Builder::default()
        .manage(LaunchTargets::from_args())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::document::take_launch_path,
            commands::document::open_local_link,
            commands::document::open_markdown_dialog,
            commands::document::load_document,
            commands::document::save_document,
            commands::image::read_relative_image,
            commands::external::open_external
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Mdrix");
}
