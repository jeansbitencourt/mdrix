use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, sync::Mutex};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchTarget {
    pub(crate) path: String,
    pub(crate) fragment: Option<String>,
}

#[derive(Default)]
pub(crate) struct LaunchTargets(Mutex<HashMap<String, LaunchTarget>>);

impl LaunchTargets {
    pub(crate) fn from_args() -> Self {
        let path = std::env::args_os()
            .skip(1)
            .map(PathBuf::from)
            .find(|path| path.is_file())
            .map(|path| path.to_string_lossy().into_owned());

        let mut targets = HashMap::new();
        if let Some(path) = path {
            targets.insert(
                "main".into(),
                LaunchTarget {
                    path,
                    fragment: None,
                },
            );
        }
        Self(Mutex::new(targets))
    }

    pub(crate) fn take(&self, label: &str) -> Option<LaunchTarget> {
        self.0.lock().ok()?.remove(label)
    }

    pub(crate) fn insert(&self, label: String, target: LaunchTarget) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "Não foi possível preparar a abertura do documento.".to_string())?
            .insert(label, target);
        Ok(())
    }

    pub(crate) fn remove(&self, label: &str) {
        if let Ok(mut targets) = self.0.lock() {
            targets.remove(label);
        }
    }
}
