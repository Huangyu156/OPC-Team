fn main() {
    for name in [
        "OPC_RELEASE_CHANNEL",
        "OPC_PRODUCT_ID",
        "OPC_DATA_NAMESPACE",
        "OPC_HIDDEN_DATA_DIRECTORY",
        "OPC_DESKTOP_BINARY_NAME",
        "OPC_DATA_MIGRATOR_BINARY_NAME",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    tauri_build::build();
}
