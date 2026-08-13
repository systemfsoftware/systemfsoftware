use dashmap::DashMap;
use std::future::Future;
use std::hash::Hash;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::OnceCell;
use tokio_util::sync::CancellationToken;

use crate::error::ClusterError;

/// Type alias for the resource factory function.
type ResourceFactory<K, V> =
    Box<dyn Fn(K) -> Pin<Box<dyn Future<Output = Result<V, ClusterError>> + Send>> + Send + Sync>;

/// A concurrent lazy resource map.
///
/// Resources are created on-demand via a factory function on first access.
/// Concurrent requests for the same key will share the same initialization,
/// ensuring the factory is called at most once per key. Each resource has
/// an associated [`CancellationToken`] that is cancelled on removal.
pub struct ResourceMap<K, V> {
    map: DashMap<K, Arc<ResourceEntry<V>>>,
    factory: ResourceFactory<K, V>,
}

/// A resource entry holding the lazily-initialized value and its cancellation token.
pub struct ResourceEntry<V> {
    value: OnceCell<V>,
    cancel: CancellationToken,
}

impl<V> ResourceEntry<V> {
    /// Get a reference to the initialized value.
    ///
    /// Returns `None` if the value has not been successfully initialized.
    pub fn value(&self) -> Option<&V> {
        self.value.get()
    }

    /// Get the cancellation token for this resource.
    pub fn cancel(&self) -> &CancellationToken {
        &self.cancel
    }
}

impl<K, V> ResourceMap<K, V>
where
    K: Hash + Eq + Clone + Send + Sync + 'static,
    V: Send + Sync + 'static,
{
    /// Create a new resource map with the given factory function.
    ///
    /// The factory is called at most once per key to create the resource.
    pub fn new<F, Fut>(factory: F) -> Self
    where
        F: Fn(K) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<V, ClusterError>> + Send + 'static,
    {
        Self {
            map: DashMap::new(),
            factory: Box::new(move |key| Box::pin(factory(key))),
        }
    }

    /// Get or create the resource for the given key.
    ///
    /// If the resource doesn't exist, it is created using the factory.
    /// Concurrent calls for the same key share initialization — the factory
    /// runs at most once per key.
    ///
    /// Returns an `Arc<ResourceEntry<V>>` whose value is guaranteed to be
    /// initialized on success.
    pub async fn get(&self, key: &K) -> Result<Arc<ResourceEntry<V>>, ClusterError> {
        let entry = self
            .map
            .entry(key.clone())
            .or_insert_with(|| {
                Arc::new(ResourceEntry {
                    value: OnceCell::new(),
                    cancel: CancellationToken::new(),
                })
            })
            .clone();

        // Initialize the value if not yet done. OnceCell::get_or_try_init
        // allows retry on failure.
        entry
            .value
            .get_or_try_init(|| (self.factory)(key.clone()))
            .await?;

        Ok(entry)
    }

    /// Remove and cancel the resource for the given key.
    ///
    /// The resource's cancellation token is triggered on removal.
    /// A subsequent `get` for the same key will create a new resource.
    pub fn remove(&self, key: &K) {
        if let Some((_, entry)) = self.map.remove(key) {
            entry.cancel.cancel();
        }
    }

    /// Remove all resources, cancelling each one.
    ///
    /// This method collects all keys first, then removes each individually.
    /// This avoids a race where entries inserted between an `iter()` and
    /// `clear()` would be removed from the map without having their
    /// cancellation tokens triggered.
    pub fn clear(&self) {
        let keys: Vec<K> = self.map.iter().map(|e| e.key().clone()).collect();
        for key in keys {
            if let Some((_, entry)) = self.map.remove(&key) {
                entry.cancel.cancel();
            }
        }
    }

    /// Number of resources currently in the map.
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// Whether the map is empty.
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// Check if a key exists in the map.
    pub fn contains_key(&self, key: &K) -> bool {
        self.map.contains_key(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI32, Ordering};

    #[tokio::test]
    async fn lazily_creates_resource_on_first_access() {
        let call_count = Arc::new(AtomicI32::new(0));
        let cc = Arc::clone(&call_count);

        let map = ResourceMap::new(move |key: String| {
            let cc = Arc::clone(&cc);
            async move {
                cc.fetch_add(1, Ordering::Relaxed);
                Ok(format!("value-{key}"))
            }
        });

        assert_eq!(map.len(), 0);
        let entry = map.get(&"k1".to_string()).await.unwrap();
        assert_eq!(entry.value().unwrap(), "value-k1");
        assert_eq!(call_count.load(Ordering::Relaxed), 1);
        assert_eq!(map.len(), 1);
    }

    #[tokio::test]
    async fn concurrent_get_same_key_calls_factory_once() {
        let call_count = Arc::new(AtomicI32::new(0));
        let cc = Arc::clone(&call_count);

        let map = Arc::new(ResourceMap::new(move |key: String| {
            let cc = Arc::clone(&cc);
            async move {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                cc.fetch_add(1, Ordering::Relaxed);
                Ok(format!("value-{key}"))
            }
        }));

        let key = "k1".to_string();
        let mut handles = vec![];
        for _ in 0..5 {
            let m = Arc::clone(&map);
            let k = key.clone();
            handles.push(tokio::spawn(async move { m.get(&k).await }));
        }

        for h in handles {
            let entry = h.await.unwrap().unwrap();
            assert_eq!(entry.value().unwrap(), "value-k1");
        }

        assert_eq!(call_count.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn remove_allows_recreation() {
        let call_count = Arc::new(AtomicI32::new(0));
        let cc = Arc::clone(&call_count);

        let map = ResourceMap::new(move |key: String| {
            let cc = Arc::clone(&cc);
            async move {
                cc.fetch_add(1, Ordering::Relaxed);
                Ok(format!("value-{key}"))
            }
        });

        let key = "k1".to_string();
        map.get(&key).await.unwrap();
        assert_eq!(call_count.load(Ordering::Relaxed), 1);

        map.remove(&key);
        assert_eq!(map.len(), 0);

        map.get(&key).await.unwrap();
        assert_eq!(call_count.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn remove_cancels_token() {
        let map = ResourceMap::new(|_key: String| async { Ok("value") });

        let key = "k1".to_string();
        let entry = map.get(&key).await.unwrap();
        let cancel = entry.cancel().clone();
        assert!(!cancel.is_cancelled());

        map.remove(&key);
        assert!(cancel.is_cancelled());
    }

    #[tokio::test]
    async fn factory_error_allows_retry() {
        let call_count = Arc::new(AtomicI32::new(0));
        let cc = Arc::clone(&call_count);

        let map = ResourceMap::new(move |_key: String| {
            let cc = Arc::clone(&cc);
            async move {
                let n = cc.fetch_add(1, Ordering::Relaxed);
                if n == 0 {
                    Err(ClusterError::PersistenceError {
                        reason: "transient".into(),
                        source: None,
                    })
                } else {
                    Ok("recovered".to_string())
                }
            }
        });

        let key = "k1".to_string();
        assert!(map.get(&key).await.is_err());

        // OnceCell::get_or_try_init retries on failure
        let entry = map.get(&key).await.unwrap();
        assert_eq!(entry.value().unwrap(), "recovered");
        assert_eq!(call_count.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn clear_removes_all_and_cancels() {
        let map = ResourceMap::new(|key: String| async move { Ok(key) });

        let entry_a = map.get(&"a".to_string()).await.unwrap();
        let entry_b = map.get(&"b".to_string()).await.unwrap();
        let cancel_a = entry_a.cancel().clone();
        let cancel_b = entry_b.cancel().clone();
        assert_eq!(map.len(), 2);

        map.clear();
        assert_eq!(map.len(), 0);
        assert!(cancel_a.is_cancelled());
        assert!(cancel_b.is_cancelled());
    }

    #[tokio::test]
    async fn contains_key_and_is_empty() {
        let map = ResourceMap::new(|key: String| async move { Ok(key) });

        assert!(map.is_empty());
        assert!(!map.contains_key(&"k".to_string()));

        map.get(&"k".to_string()).await.unwrap();
        assert!(!map.is_empty());
        assert!(map.contains_key(&"k".to_string()));
    }
}
