#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"

: "${HOME:?HOME must be set to install Mdrix}"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
if [[ "$data_home" != /* ]]; then
  printf 'XDG_DATA_HOME must be an absolute path: %s\n' "$data_home" >&2
  exit 1
fi

install_dir="$data_home/mdrix"
applications_dir="$data_home/applications"
desktop_file="$applications_dir/com.mdrix.app.desktop"
installed_binary="$install_dir/mdrix"
installed_icon="$install_dir/icon.png"
release_binary="$repo_root/src-tauri/target/release/mdrix"

mode=install
build=1
while (($#)); do
  case "$1" in
    --no-build)
      build=0
      ;;
    --uninstall)
      mode=uninstall
      ;;
    --help|-h)
      cat <<'EOF'
Usage: packaging/install-linux.sh [--no-build | --uninstall]

Builds Mdrix in release mode and installs it for the current user, including
its desktop launcher and icon. Requires npm, Rust/Cargo, and Tauri's Linux
build dependencies. --no-build uses src-tauri/target/release/mdrix as-is.
--uninstall removes the files installed by this script.
EOF
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$mode" == uninstall ]]; then
  rm -f -- "$desktop_file" "$installed_binary" "$installed_icon"
  rmdir -- "$install_dir" 2>/dev/null || true
  if command -v update-desktop-database >/dev/null 2>&1 && [[ -d "$applications_dir" ]]; then
    update-desktop-database "$applications_dir"
  fi
  printf 'Mdrix foi removido da instalação local do usuário.\n'
  exit 0
fi

if ((build)); then
  for command_name in npm cargo; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      printf 'Comando necessário não encontrado: %s\n' "$command_name" >&2
      exit 1
    fi
  done

  if [[ ! -x "$repo_root/node_modules/.bin/tauri" ]]; then
    printf 'Instalando dependências do projeto com npm ci...\n'
    (cd -- "$repo_root" && npm ci)
  fi

  printf 'Compilando Mdrix em modo release...\n'
  (cd -- "$repo_root" && npm run tauri build -- --no-bundle)
fi

if [[ ! -x "$release_binary" ]]; then
  printf 'Executável release não encontrado: %s\n' "$release_binary" >&2
  if ((build == 0)); then
    printf 'Compile o app ou execute o script sem --no-build.\n' >&2
  fi
  exit 1
fi

mkdir -p -- "$install_dir" "$applications_dir"
install -m 755 -- "$release_binary" "$installed_binary"
install -m 644 -- "$repo_root/src-tauri/icons/icon.png" "$installed_icon"

desktop_exec_path() {
  local value="$1"
  local escaped=""
  local character
  local index

  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    printf 'Caminhos com quebras de linha não são suportados em arquivos .desktop.\n' >&2
    return 1
  fi

  for ((index = 0; index < ${#value}; index += 1)); do
    character="${value:index:1}"
    case "$character" in
      \\|\"|\`|\$)
        escaped+="\\$character"
        ;;
      %)
        escaped+="%%"
        ;;
      *)
        escaped+="$character"
        ;;
    esac
  done

  printf '"%s"' "$escaped"
}

exec_path="$(desktop_exec_path "$installed_binary")"
desktop_tmp="$(mktemp --suffix=.desktop "$applications_dir/.com.mdrix.app.XXXXXX")"
trap 'rm -f -- "$desktop_tmp"' EXIT
cat > "$desktop_tmp" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Mdrix
GenericName=Markdown Editor
Comment=Leitor e editor Markdown minimalista
Exec=$exec_path %f
Icon=$installed_icon
Terminal=false
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;
StartupNotify=true
StartupWMClass=mdrix
EOF

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$desktop_tmp"
fi
install -m 644 -- "$desktop_tmp" "$desktop_file"
rm -f -- "$desktop_tmp"
trap - EXIT

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$applications_dir"
fi

printf 'Mdrix instalado para o usuário atual.\n'
printf 'Atalho: %s\n' "$desktop_file"
printf 'Use “Abrir com” para associar documentos Markdown; o app padrão não foi alterado.\n'
