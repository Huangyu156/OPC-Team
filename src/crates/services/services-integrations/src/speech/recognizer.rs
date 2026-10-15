use super::types::{SpeechRecognizerKind, SpeechTranscribeRequest, SpeechTranscriptionResult};
use super::OpcTeamResult;
use async_trait::async_trait;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub(super) struct SpeechRecognizerWarmupRequest {
    pub model_dir: PathBuf,
    pub recognizer: SpeechRecognizerKind,
    pub language: String,
}

#[async_trait]
pub(super) trait SpeechRecognizer: Send + Sync {
    async fn warmup(&self, request: SpeechRecognizerWarmupRequest) -> OpcTeamResult<()>;

    async fn unload(&self) -> OpcTeamResult<()>;

    async fn transcribe(
        &self,
        request: SpeechTranscribeRequest,
    ) -> OpcTeamResult<SpeechTranscriptionResult>;
}
