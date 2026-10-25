pub mod vfs;

use vfs::{VfsEngine};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct UnkayKernel {
    vfs: VfsEngine,
}

#[wasm_bindgen]
impl UnkayKernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            vfs: VfsEngine::new(),
        }
    }

    #[wasm_bindgen]
    pub fn version(&self) -> String {
        "2.0.0-wasm".to_string()
    }

    #[wasm_bindgen]
    pub fn exists(&self, path: &str) -> bool {
        self.vfs.exists(path)
    }

    #[wasm_bindgen]
    pub fn stat(&self, path: &str) -> Result<JsValue, JsValue> {
        let stat = self.vfs.stat(path).map_err(|e| JsValue::from_str(&e))?;
        serde_wasm_bindgen_compat(&stat)
    }

    #[wasm_bindgen]
    pub fn mkdir(&mut self, path: &str, recursive: bool) -> Result<(), JsValue> {
        self.vfs.mkdir(path, recursive).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn write_file(&mut self, path: &str, data: &[u8]) -> Result<(), JsValue> {
        self.vfs.write_file(path, data).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn write_text(&mut self, path: &str, text: &str) -> Result<(), JsValue> {
        self.vfs.write_file(path, text.as_bytes()).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn read_file(&self, path: &str) -> Result<Vec<u8>, JsValue> {
        self.vfs.read_file(path).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn read_text(&self, path: &str) -> Result<String, JsValue> {
        self.vfs.read_text(path).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn readdir(&self, path: &str) -> Result<JsValue, JsValue> {
        let entries = self.vfs.readdir(path).map_err(|e| JsValue::from_str(&e))?;
        serde_wasm_bindgen_compat(&entries)
    }

    #[wasm_bindgen]
    pub fn remove(&mut self, path: &str, recursive: bool) -> Result<(), JsValue> {
        self.vfs.remove(path, recursive).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn export_tree_json(&self) -> Result<String, JsValue> {
        self.vfs.export_tree_json().map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn import_legacy_tree_json(&mut self, json_str: &str) -> Result<usize, JsValue> {
        self.vfs.import_legacy_tree_json(json_str).map_err(|e| JsValue::from_str(&e))
    }
}

fn serde_wasm_bindgen_compat<T: serde::Serialize>(val: &T) -> Result<JsValue, JsValue> {
    let json_str = serde_json::to_string(val).map_err(|e| JsValue::from_str(&e.to_string()))?;
    js_sys::JSON::parse(&json_str).map_err(|e| JsValue::from(e))
}
