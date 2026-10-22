import client from 'prom-client';

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'kb_' });
  const m = {
    registry,
    httpDuration: new client.Histogram({ name: 'kb_http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [registry] }),
    collabConnections: new client.Gauge({ name: 'kb_collab_connections', help: 'Open collaboration WebSocket connections', registers: [registry] }),
    collabDocs: new client.Gauge({ name: 'kb_collab_documents', help: 'Documents loaded in memory', registers: [registry] }),
    collabUpdates: new client.Counter({ name: 'kb_collab_updates_total', help: 'Accepted document updates', registers: [registry] }),
    collabRejected: new client.Counter({ name: 'kb_collab_rejected_total', help: 'Rejected (schema-invalid) updates', registers: [registry] }),
    collabPersistFailures: new client.Counter({ name: 'kb_collab_persist_failures_total', help: 'Updates that could not be persisted', registers: [registry] }),
    collabPersistSeconds: new client.Histogram({ name: 'kb_collab_persist_seconds', help: 'Durable commit latency of document updates', buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2], registers: [registry] }),
    jobsTotal: new client.Counter({ name: 'kb_jobs_total', help: 'Background jobs finished', labelNames: ['type', 'status'], registers: [registry] }),
    jobsQueued: new client.Gauge({ name: 'kb_jobs_queued', help: 'Queued background jobs', registers: [registry] }),
    outboxLag: new client.Gauge({ name: 'kb_outbox_pending', help: 'Pending outbox events (search indexing etc.)', registers: [registry] }),
    backupAgeSeconds: new client.Gauge({ name: 'kb_backup_age_seconds', help: 'Age of the last successful backup', registers: [registry] }),
    restoreVerifyAgeSeconds: new client.Gauge({ name: 'kb_restore_verification_age_seconds', help: 'Age of the last successful restore verification', registers: [registry] }),
    clientErrors: new client.Counter({ name: 'kb_client_errors_total', help: 'Errors reported by browsers', labelNames: ['kind'], registers: [registry] }),
    clientUnsyncedAge: new client.Histogram({ name: 'kb_client_unsynced_queue_age_seconds', help: 'Age of oldest unsynced local change reported by clients', buckets: [1, 5, 15, 60, 300, 1800], registers: [registry] }),
    clientInputLatency: new client.Histogram({ name: 'kb_client_input_latency_ms', help: 'Input-to-paint latency reported by clients', buckets: [8, 16, 33, 50, 75, 100, 200, 500], registers: [registry] }),
    integrityErrors: new client.Gauge({ name: 'kb_integrity_errors', help: 'Data integrity problems found by the last check', registers: [registry] }),
  };
  return m;
}

export type Metrics = ReturnType<typeof createMetrics>;
