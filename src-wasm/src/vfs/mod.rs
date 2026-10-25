use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Inode {
    pub name: String,
    pub is_dir: bool,
    pub permissions: String,
    pub owner: String,
    pub size: usize,
    pub created_at: String,
    pub modified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: usize,
    pub modified_at: String,
    pub permissions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStat {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: usize,
    pub created_at: String,
    pub modified_at: String,
    pub permissions: String,
    pub owner: String,
}

pub struct VfsEngine {
    nodes: HashMap<String, Inode>,
}

impl VfsEngine {
    pub fn new() -> Self {
        let mut vfs = Self {
            nodes: HashMap::new(),
        };
        vfs.init_default_tree();
        vfs
    }

    pub fn normalize_path(path: &str) -> String {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed == "/" {
            return "/".to_string();
        }

        let is_absolute = trimmed.starts_with('/');
        let parts = trimmed.split('/');
        let mut stack = Vec::new();

        for part in parts {
            if part.is_empty() || part == "." {
                continue;
            } else if part == ".." {
                stack.pop();
            } else {
                stack.push(part);
            }
        }

        let joined = stack.join("/");
        if is_absolute {
            format!("/{}", joined)
        } else {
            joined
        }
    }

    pub fn parent_path(path: &str) -> String {
        let normalized = Self::normalize_path(path);
        if normalized == "/" {
            return "/".to_string();
        }
        if let Some(idx) = normalized.rfind('/') {
            if idx == 0 {
                "/".to_string()
            } else {
                normalized[..idx].to_string()
            }
        } else {
            "/".to_string()
        }
    }

    pub fn base_name(path: &str) -> String {
        let normalized = Self::normalize_path(path);
        if normalized == "/" {
            return "".to_string();
        }
        normalized
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string()
    }

    fn now_iso() -> String {
        "2026-10-25T15:00:00.000Z".to_string()
    }

    pub fn init_default_tree(&mut self) {
        let now = Self::now_iso();
        // Root
        self.nodes.insert(
            "/".to_string(),
            Inode {
                name: "".to_string(),
                is_dir: true,
                permissions: "rwxr-xr-x".to_string(),
                owner: "system".to_string(),
                size: 0,
                created_at: now.clone(),
                modified_at: now.clone(),
                content: None,
                children: Some(vec![
                    "apps".to_string(),
                    "assets".to_string(),
                    "auth".to_string(),
                    "core".to_string(),
                    "design-system".to_string(),
                    "docs".to_string(),
                    "home".to_string(),
                    "tmp".to_string(),
                ]),
            },
        );

        let system_dirs = [
            "/apps",
            "/assets",
            "/auth",
            "/core",
            "/design-system",
            "/docs",
            "/home",
            "/home/guest",
            "/home/guest/Desktop",
            "/home/guest/Documents",
            "/home/guest/Downloads",
            "/tmp",
        ];

        for dir in system_dirs {
            let parent = Self::parent_path(dir);
            let name = Self::base_name(dir);
            self.nodes.insert(
                dir.to_string(),
                Inode {
                    name: name.clone(),
                    is_dir: true,
                    permissions: "rwxr-xr-x".to_string(),
                    owner: "system".to_string(),
                    size: 0,
                    created_at: now.clone(),
                    modified_at: now.clone(),
                    content: None,
                    children: Some(Vec::new()),
                },
            );

            if let Some(parent_node) = self.nodes.get_mut(&parent) {
                if let Some(ref mut children) = parent_node.children {
                    if !children.contains(&name) {
                        children.push(name);
                    }
                }
            }
        }
    }

    pub fn exists(&self, path: &str) -> bool {
        let norm = Self::normalize_path(path);
        self.nodes.contains_key(&norm)
    }

    pub fn stat(&self, path: &str) -> Result<FileStat, String> {
        let norm = Self::normalize_path(path);
        match self.nodes.get(&norm) {
            Some(inode) => Ok(FileStat {
                name: inode.name.clone(),
                path: norm,
                is_dir: inode.is_dir,
                size: inode.size,
                created_at: inode.created_at.clone(),
                modified_at: inode.modified_at.clone(),
                permissions: inode.permissions.clone(),
                owner: inode.owner.clone(),
            }),
            None => Err(format!("Path not found: {}", norm)),
        }
    }

    pub fn mkdir(&mut self, path: &str, recursive: bool) -> Result<(), String> {
        let norm = Self::normalize_path(path);
        if self.nodes.contains_key(&norm) {
            return Ok(());
        }

        let parent = Self::parent_path(&norm);
        if !self.nodes.contains_key(&parent) {
            if recursive {
                self.mkdir(&parent, true)?;
            } else {
                return Err(format!("Parent directory does not exist: {}", parent));
            }
        }

        let parent_node = self.nodes.get(&parent).unwrap();
        if !parent_node.is_dir {
            return Err(format!("Parent is not a directory: {}", parent));
        }

        let name = Self::base_name(&norm);
        let now = Self::now_iso();

        self.nodes.insert(
            norm.clone(),
            Inode {
                name: name.clone(),
                is_dir: true,
                permissions: "rwxr-xr-x".to_string(),
                owner: "user".to_string(),
                size: 0,
                created_at: now.clone(),
                modified_at: now.clone(),
                content: None,
                children: Some(Vec::new()),
            },
        );

        if let Some(parent_node) = self.nodes.get_mut(&parent) {
            if let Some(ref mut children) = parent_node.children {
                if !children.contains(&name) {
                    children.push(name);
                }
            }
            parent_node.modified_at = now;
        }

        Ok(())
    }

    pub fn write_file(&mut self, path: &str, data: &[u8]) -> Result<(), String> {
        let norm = Self::normalize_path(path);
        let parent = Self::parent_path(&norm);

        if !self.nodes.contains_key(&parent) {
            self.mkdir(&parent, true)?;
        }

        let name = Self::base_name(&norm);
        let now = Self::now_iso();
        let size = data.len();

        let created_at = if let Some(existing) = self.nodes.get(&norm) {
            if existing.is_dir {
                return Err(format!("Cannot overwrite directory with file: {}", norm));
            }
            existing.created_at.clone()
        } else {
            now.clone()
        };

        self.nodes.insert(
            norm.clone(),
            Inode {
                name: name.clone(),
                is_dir: false,
                permissions: "rw-r--r--".to_string(),
                owner: "user".to_string(),
                size,
                created_at,
                modified_at: now.clone(),
                content: Some(data.to_vec()),
                children: None,
            },
        );

        if let Some(parent_node) = self.nodes.get_mut(&parent) {
            if let Some(ref mut children) = parent_node.children {
                if !children.contains(&name) {
                    children.push(name);
                }
            }
            parent_node.modified_at = now;
        }

        Ok(())
    }

    pub fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        let norm = Self::normalize_path(path);
        match self.nodes.get(&norm) {
            Some(inode) => {
                if inode.is_dir {
                    Err(format!("Path is a directory: {}", norm))
                } else if let Some(ref bytes) = inode.content {
                    Ok(bytes.clone())
                } else {
                    Ok(Vec::new())
                }
            }
            None => Err(format!("File not found: {}", norm)),
        }
    }

    pub fn read_text(&self, path: &str) -> Result<String, String> {
        let bytes = self.read_file(path)?;
        String::from_utf8(bytes).map_err(|e| format!("UTF-8 decode error: {}", e))
    }

    pub fn readdir(&self, path: &str) -> Result<Vec<FsEntry>, String> {
        let norm = Self::normalize_path(path);
        let node = self
            .nodes
            .get(&norm)
            .ok_or_else(|| format!("Directory not found: {}", norm))?;

        if !node.is_dir {
            return Err(format!("Path is not a directory: {}", norm));
        }

        let mut entries = Vec::new();
        if let Some(ref children) = node.children {
            for child_name in children {
                let child_path = if norm == "/" {
                    format!("/{}", child_name)
                } else {
                    format!("{}/{}", norm, child_name)
                };

                if let Some(child_node) = self.nodes.get(&child_path) {
                    entries.push(FsEntry {
                        name: child_name.clone(),
                        path: child_path,
                        is_dir: child_node.is_dir,
                        size: child_node.size,
                        modified_at: child_node.modified_at.clone(),
                        permissions: child_node.permissions.clone(),
                    });
                }
            }
        }

        Ok(entries)
    }

    pub fn remove(&mut self, path: &str, recursive: bool) -> Result<(), String> {
        let norm = Self::normalize_path(path);
        if norm == "/" {
            return Err("Cannot remove root directory".to_string());
        }

        let node = self
            .nodes
            .get(&norm)
            .ok_or_else(|| format!("Path not found: {}", norm))?
            .clone();

        if node.is_dir {
            if let Some(ref children) = node.children {
                if !children.is_empty() && !recursive {
                    return Err(format!(
                        "Directory not empty: {}. Use recursive=true.",
                        norm
                    ));
                }
                for child_name in children {
                    let child_path = format!("{}/{}", norm, child_name);
                    self.remove(&child_path, true)?;
                }
            }
        }

        self.nodes.remove(&norm);

        // Remove from parent
        let parent = Self::parent_path(&norm);
        let name = Self::base_name(&norm);
        if let Some(parent_node) = self.nodes.get_mut(&parent) {
            if let Some(ref mut children) = parent_node.children {
                children.retain(|c| c != &name);
            }
            parent_node.modified_at = Self::now_iso();
        }

        Ok(())
    }

    pub fn export_tree_json(&self) -> Result<String, String> {
        serde_json::to_string(&self.nodes).map_err(|e| format!("Serialization error: {}", e))
    }

    pub fn import_legacy_tree_json(&mut self, json_str: &str) -> Result<usize, String> {
        let legacy_map: HashMap<String, serde_json::Value> =
            serde_json::from_str(json_str).map_err(|e| format!("JSON parse error: {}", e))?;

        let mut count = 0;
        for (path, val) in legacy_map {
            let norm = Self::normalize_path(&path);
            let entry_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("file");
            let name = val
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| Self::base_name(&norm));

            let created = val
                .get("created")
                .and_then(|v| v.as_str())
                .unwrap_or("2026-10-25T15:00:00.000Z")
                .to_string();

            let modified = val
                .get("modified")
                .and_then(|v| v.as_str())
                .unwrap_or(&created)
                .to_string();

            let permissions = val
                .get("permissions")
                .and_then(|v| v.as_str())
                .unwrap_or("rwxr-xr-x")
                .to_string();

            let owner = val
                .get("owner")
                .and_then(|v| v.as_str())
                .unwrap_or("user")
                .to_string();

            if entry_type == "directory" {
                let children: Vec<String> = val
                    .get("children")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|c| c.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                self.nodes.insert(
                    norm.clone(),
                    Inode {
                        name,
                        is_dir: true,
                        permissions,
                        owner,
                        size: 0,
                        created_at: created,
                        modified_at: modified,
                        content: None,
                        children: Some(children),
                    },
                );
            } else {
                let content_str = val.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let bytes = content_str.as_bytes().to_vec();
                let size = bytes.len();

                self.nodes.insert(
                    norm.clone(),
                    Inode {
                        name,
                        is_dir: false,
                        permissions,
                        owner,
                        size,
                        created_at: created,
                        modified_at: modified,
                        content: Some(bytes),
                        children: None,
                    },
                );
            }
            count += 1;
        }

        Ok(count)
    }
}
