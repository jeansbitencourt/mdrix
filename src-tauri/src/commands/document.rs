use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::PathBuf};
use tauri::State;
use tempfile::NamedTempFile;

use crate::state::LaunchPath;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DocumentPayload {
    path: String,
    content: String,
    fingerprint: String,
    line_ending: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavePayload {
    fingerprint: String,
}

#[tauri::command]
pub(crate) fn take_launch_path(state: State<'_, LaunchPath>) -> Option<String> {
    state.take()
}

#[tauri::command]
pub(crate) async fn load_document(path: String) -> Result<DocumentPayload, String> {
    tauri::async_runtime::spawn_blocking(move || load_document_blocking(path))
        .await
        .map_err(|error| format!("Não foi possível carregar o arquivo: {error}"))?
}

fn load_document_blocking(path: String) -> Result<DocumentPayload, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Não foi possível resolver o arquivo: {error}"))?;
    let bytes =
        fs::read(&path).map_err(|error| format!("Não foi possível abrir o arquivo: {error}"))?;
    let fingerprint = fingerprint(&bytes);
    let content =
        String::from_utf8(bytes).map_err(|_| "O arquivo não é UTF-8 válido.".to_string())?;
    let line_ending = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };

    Ok(DocumentPayload {
        path: path.to_string_lossy().into_owned(),
        content: normalize_newlines(&content),
        fingerprint,
        line_ending: line_ending.into(),
    })
}

#[tauri::command]
pub(crate) async fn save_document(
    path: String,
    expected_hash: String,
    contents: String,
) -> Result<SavePayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_document_blocking(path, expected_hash, contents)
    })
    .await
    .map_err(|error| format!("Não foi possível salvar o arquivo: {error}"))?
}

fn save_document_blocking(
    path: String,
    expected_hash: String,
    contents: String,
) -> Result<SavePayload, String> {
    let path = PathBuf::from(path);
    let current = fs::read(&path)
        .map_err(|error| format!("Não foi possível conferir o arquivo antes de salvar: {error}"))?;
    if fingerprint(&current) != expected_hash {
        return Err("O arquivo mudou fora do Mdrix. Reabra-o antes de salvar para evitar sobrescrever alterações.".into());
    }

    let parent = path
        .parent()
        .ok_or_else(|| "O arquivo não tem diretório pai válido.".to_string())?;
    let permissions = fs::metadata(&path)
        .map_err(|error| format!("Não foi possível ler as permissões do arquivo: {error}"))?
        .permissions();
    let mut temp = NamedTempFile::new_in(parent)
        .map_err(|error| format!("Não foi possível preparar o salvamento atômico: {error}"))?;
    temp.write_all(contents.as_bytes())
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|error| format!("Não foi possível gravar o documento: {error}"))?;
    temp.as_file()
        .set_permissions(permissions)
        .map_err(|error| format!("Não foi possível preservar as permissões: {error}"))?;
    temp.persist(&path)
        .map_err(|error| format!("Não foi possível substituir o arquivo: {}", error.error))?;

    let _ = fs::File::open(parent).and_then(|directory| directory.sync_all());
    Ok(SavePayload {
        fingerprint: fingerprint(contents.as_bytes()),
    })
}

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
