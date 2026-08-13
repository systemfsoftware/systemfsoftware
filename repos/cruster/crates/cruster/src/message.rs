use crate::envelope::EnvelopeRequest;
use crate::reply::Reply;

/// Channel types for reply delivery.
pub type ReplySender = tokio::sync::mpsc::Sender<Reply>;
pub type ReplyReceiver = tokio::sync::mpsc::Receiver<Reply>;

/// Incoming message to be processed by an entity.
#[derive(Debug)]
pub enum IncomingMessage {
    /// A request expecting a reply.
    Request {
        request: EnvelopeRequest,
        reply_tx: ReplySender,
    },
    /// A fire-and-forget envelope (no reply channel).
    Envelope { envelope: EnvelopeRequest },
}

/// Outgoing message from a client.
#[derive(Debug)]
pub enum OutgoingMessage {
    /// A request with a reply channel.
    Request {
        request: EnvelopeRequest,
        reply_rx: ReplyReceiver,
    },
    /// A fire-and-forget envelope.
    Envelope { envelope: EnvelopeRequest },
}

impl IncomingMessage {
    /// Get the envelope request regardless of variant.
    pub fn envelope(&self) -> &EnvelopeRequest {
        match self {
            IncomingMessage::Request { request, .. } => request,
            IncomingMessage::Envelope { envelope } => envelope,
        }
    }
}
