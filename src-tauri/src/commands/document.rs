use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;

use crate::state::{LaunchTarget, LaunchTargets};

static NEXT_DOCUMENT_WINDOW: AtomicU64 = AtomicU64::new(1);

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
pub(crate) fn take_launch_path(
    window: tauri::WebviewWindow,
    state: State<'_, LaunchTargets>,
) -> Option<LaunchTarget> {
    state.take(window.label())
}

#[tauri::command]
pub(crate) fn open_local_link(
    document_path: String,
    href: String,
    app: tauri::AppHandle,
    targets: State<'_, LaunchTargets>,
) -> Result<Option<String>, String> {
    let (target, fragment) = resolve_local_link(&document_path, &href)?;
    if !target.is_file() {
        return Err("O destino do link não é um arquivo.".into());
    }
    let source = Path::new(&document_path)
        .canonicalize()
        .map_err(|error| format!("Não foi possível resolver o documento de origem: {error}"))?;
    if target == source {
        return Ok(fragment);
    }

    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown") {
        return Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map(|_| None)
            .map_err(|error| format!("Não foi possível abrir o arquivo no sistema: {error}"));
    }

    let label = format!(
        "document-{}",
        NEXT_DOCUMENT_WINDOW.fetch_add(1, Ordering::Relaxed)
    );
    let title = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Mdrix")
        .to_string();
    targets.insert(
        label.clone(),
        LaunchTarget {
            path: target.to_string_lossy().into_owned(),
            fragment,
        },
    )?;

    let result =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(title)
            .build();
    if let Err(error) = result {
        targets.remove(&label);
        return Err(format!("Não foi possível abrir uma nova janela: {error}"));
    }
    Ok(None)
}

fn resolve_local_link(
    document_path: &str,
    href: &str,
) -> Result<(PathBuf, Option<String>), String> {
    let (path_and_query, fragment) = href
        .split_once('#')
        .map(|(path, fragment)| (path, Some(fragment)))
        .unwrap_or((href, None));
    let path_part = path_and_query
        .split_once('?')
        .map_or(path_and_query, |(path, _)| path);
    if path_part.is_empty() {
        return Err("O link não aponta para um arquivo local.".into());
    }

    let raw_path = if path_part.to_ascii_lowercase().starts_with("file://") {
        let remainder = &path_part[7..];
        if remainder.starts_with('/') {
            remainder
        } else {
            let (host, path) = remainder
                .split_once('/')
                .ok_or_else(|| "A URL file: não contém um caminho local válido.".to_string())?;
            if !host.eq_ignore_ascii_case("localhost") {
                return Err("URLs file: só podem apontar para este computador.".into());
            }
            // Keep the slash that begins the absolute path.
            return resolve_decoded_local_path(document_path, &format!("/{path}"), fragment);
        }
    } else if path_part.to_ascii_lowercase().starts_with("file:/") {
        &path_part[5..]
    } else {
        if has_uri_scheme(path_part) {
            return Err("O esquema deste link local não é suportado.".into());
        }
        path_part
    };

    resolve_decoded_local_path(document_path, raw_path, fragment)
}

fn resolve_decoded_local_path(
    document_path: &str,
    raw_path: &str,
    fragment: Option<&str>,
) -> Result<(PathBuf, Option<String>), String> {
    let decoded_path = percent_encoding::percent_decode_str(raw_path)
        .decode_utf8()
        .map_err(|_| "O caminho do link contém texto inválido.".to_string())?;
    let decoded_path = Path::new(decoded_path.as_ref());
    let target = if decoded_path.is_absolute() {
        decoded_path.to_path_buf()
    } else {
        let source = Path::new(document_path)
            .canonicalize()
            .map_err(|error| format!("Não foi possível resolver o documento de origem: {error}"))?;
        let base = source
            .parent()
            .ok_or_else(|| "O documento de origem não tem uma pasta válida.".to_string())?;
        base.join(decoded_path)
    }
    .canonicalize()
    .map_err(|error| format!("Não foi possível localizar o destino do link: {error}"))?;
    let fragment = fragment
        .filter(|value| !value.is_empty())
        .map(|value| {
            percent_encoding::percent_decode_str(value)
                .decode_utf8()
                .map(|value| value.into_owned())
                .map_err(|_| "A âncora do link contém texto inválido.".to_string())
        })
        .transpose()?;
    Ok((target, fragment))
}

fn has_uri_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    let mut characters = scheme.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')
        })
}

#[tauri::command]
pub(crate) async fn open_markdown_dialog(window: tauri::Window) -> Result<Option<String>, String> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        window
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Abrir documento Markdown")
            .add_filter("Markdown", &["md", "markdown"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| format!("Não foi possível abrir o seletor de arquivos: {error}"))?;

    match selected {
        Some(file) => {
            let path = file.into_path().map_err(|error| {
                format!("Não foi possível acessar o arquivo selecionado: {error}")
            })?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
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
