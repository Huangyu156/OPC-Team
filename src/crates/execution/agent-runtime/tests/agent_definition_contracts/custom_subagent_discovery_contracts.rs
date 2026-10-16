use opc_agent_runtime::custom_agent::CustomAgentKind;
use opc_agent_runtime::custom_subagent::{
    custom_subagent_possible_dirs, custom_subagent_save_markdown_file,
    load_custom_subagent_definitions, CustomSubagentDefinition, CustomSubagentDiscoveryRoots,
    CustomSubagentKind,
};
use std::fs;
use std::path::{Path, PathBuf};

fn build_definition(
    id: &str,
    name: &str,
    description: &str,
    level: CustomSubagentKind,
) -> CustomSubagentDefinition {
    CustomSubagentDefinition::from_front_matter_fields(
        Some(id),
        Some(name),
        Some(description),
        Some(CustomAgentKind::Subagent),
        None,
        None,
        None,
        None,
        None,
        format!("{name} prompt."),
        level,
    )
    .expect("custom subagent definition should be valid")
    .definition
}

#[test]
fn custom_subagent_discovery_preserves_opc_priority_and_ignores_foreign_agent_dirs() {
    let workspace = TestTempDir::new("opc-runtime-subagent-workspace");
    let opc_user = TestTempDir::new("opc-runtime-subagent-user");
    let home = TestTempDir::new("opc-runtime-subagent-home");

    let project_opc = workspace
        .path
        .join(opc_core_types::product_identity::hidden_data_directory())
        .join("agents");
    let project_claude = workspace.path.join(".claude").join("agents");
    let user_opc = opc_user.path.join("agents");
    let home_claude = home.path.join(".claude").join("agents");
    fs::create_dir_all(&project_opc).expect("project openbitfun agents dir should be created");
    fs::create_dir_all(&project_claude).expect("project claude agents dir should be created");
    fs::create_dir_all(&user_opc).expect("user openbitfun agents dir should be created");
    fs::create_dir_all(&home_claude).expect("home claude agents dir should be created");

    write_agent(
        &project_opc.join("shared.md"),
        "Shared",
        "Shared",
        "Project OPC-Team agent",
        CustomSubagentKind::Project,
    );
    write_agent(
        &project_claude.join("shared.md"),
        "Shared",
        "Shared duplicate",
        "Project Claude duplicate",
        CustomSubagentKind::Project,
    );
    write_agent(
        &user_opc.join("user-only.md"),
        "UserOnly",
        "UserOnly",
        "OPC-Team user agent",
        CustomSubagentKind::User,
    );
    write_agent(
        &home_claude.join("home-only.md"),
        "HomeOnly",
        "HomeOnly",
        "Claude user agent",
        CustomSubagentKind::User,
    );
    fs::write(project_opc.join("ignored.txt"), "ignored")
        .expect("ignored text file should be written");
    fs::create_dir_all(project_opc.join("nested")).expect("nested dir should be created");
    write_agent(
        &project_opc.join("nested").join("nested.md"),
        "Nested",
        "Nested",
        "Nested project agent",
        CustomSubagentKind::Project,
    );

    let roots = CustomSubagentDiscoveryRoots {
        workspace_root: Some(workspace.path.clone()),
        opc_user_agents_dir: Some(user_opc.clone()),
        home_dir: Some(home.path.clone()),
    };

    let dirs = custom_subagent_possible_dirs(&roots);
    assert_eq!(
        dirs.iter()
            .map(|entry| entry.path.as_path())
            .collect::<Vec<_>>(),
        vec![project_opc.as_path(), user_opc.as_path()]
    );
    assert_eq!(
        dirs.iter().map(|entry| entry.level).collect::<Vec<_>>(),
        vec![CustomSubagentKind::Project, CustomSubagentKind::User]
    );

    let report = load_custom_subagent_definitions(&roots);
    assert!(report.errors.is_empty());
    assert_eq!(
        report
            .definitions
            .iter()
            .map(|loaded| loaded.definition.id.as_str())
            .collect::<Vec<_>>(),
        vec!["Shared", "UserOnly"]
    );
    assert_eq!(
        report.definitions[0].definition.description,
        "Project OPC-Team agent"
    );
    assert_eq!(report.definitions[0].path, project_opc.join("shared.md"));
}

#[test]
fn custom_subagent_discovery_reports_parse_errors_without_dropping_valid_files() {
    let workspace = TestTempDir::new("opc-runtime-subagent-invalid");
    let project_opc = workspace
        .path
        .join(opc_core_types::product_identity::hidden_data_directory())
        .join("agents");
    fs::create_dir_all(&project_opc).expect("project agents dir should be created");
    let broken_path = project_opc.join("broken.md");
    fs::write(&broken_path, "No front matter").expect("broken markdown file should be written");
    write_agent(
        &project_opc.join("valid.md"),
        "Valid",
        "Valid",
        "Valid project agent",
        CustomSubagentKind::Project,
    );

    let roots = CustomSubagentDiscoveryRoots {
        workspace_root: Some(workspace.path.clone()),
        opc_user_agents_dir: None,
        home_dir: None,
    };

    let report = load_custom_subagent_definitions(&roots);
    assert_eq!(report.definitions.len(), 1);
    assert_eq!(report.definitions[0].definition.id, "Valid");
    assert_eq!(report.errors.len(), 1);
    assert_eq!(report.errors[0].path, broken_path);
    assert_eq!(
        report.errors[0].error,
        "Failed to parse markdown file: Failed to capture content"
    );
}

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", unique_suffix()));
        fs::create_dir_all(&path).expect("temp dir should be created");
        Self { path }
    }
}

impl Drop for TestTempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn write_agent(path: &Path, id: &str, name: &str, description: &str, level: CustomSubagentKind) {
    let definition = build_definition(id, name, description, level);
    custom_subagent_save_markdown_file(path, &definition)
        .expect("custom subagent markdown should save");
}

fn unique_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after UNIX epoch")
        .as_nanos()
        .to_string()
}
