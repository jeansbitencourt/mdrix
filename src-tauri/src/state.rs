use std::{path::PathBuf, sync::Mutex};

#[derive(Default)]
pub(crate) struct LaunchPath(Mutex<Option<String>>);

impl LaunchPath {
    pub(crate) fn from_args() -> Self {
        let path = std::env::args_os()
            .skip(1)
            .map(PathBuf::from)
            .find(|path| path.is_file())
            .map(|path| path.to_string_lossy().into_owned());

        Self(Mutex::new(path))
    }

    pub(crate) fn take(&self) -> Option<String> {
        self.0.lock().ok()?.take()
    }
}
