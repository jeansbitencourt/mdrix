use base64::{engine::general_purpose::STANDARD, Engine as _};
use percent_encoding::percent_decode_str;
use std::path::{Component, Path};

const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

#[tauri::command]
pub(crate) fn read_relative_image(
    document_path: String,
    relative_path: String,
) -> Result<String, String> {
    let decoded = percent_decode_str(&relative_path).decode_utf8_lossy();
    let relative = Path::new(decoded.split(['?', '#']).next().unwrap_or_default());
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("A imagem precisa ser um caminho local dentro da pasta do documento.".into());
    }

    let base = Path::new(&document_path)
        .parent()
        .ok_or_else(|| "O documento não tem uma pasta base válida.".to_string())?
        .canonicalize()
        .map_err(|error| format!("Não foi possível resolver a pasta do documento: {error}"))?;
    let target = base
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("Imagem local indisponível: {error}"))?;
    if !target.starts_with(&base) || !target.is_file() {
        return Err("O caminho da imagem está fora da pasta do documento.".into());
    }

    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        _ => return Err("Formato de imagem não suportado pelo Mdrix.".into()),
    };
    let metadata = std::fs::metadata(&target)
        .map_err(|error| format!("Não foi possível ler a imagem: {error}"))?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("Imagem maior que o limite experimental de 25 MiB.".into());
    }
    let bytes =
        std::fs::read(target).map_err(|error| format!("Não foi possível ler a imagem: {error}"))?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
