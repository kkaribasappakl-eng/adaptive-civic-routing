-- Migration: 008_citizen_notifications.sql
-- Description: Citizen notification table, indexes, and controlled event notification types
-- Stage: Stage 8 — Citizen Notification & Real-Time Case Updates

--------------------------------------------------------------------------------
-- 1. Create Citizen Notifications Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citizen_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE NULL,
    idempotency_key VARCHAR(150) NULL,

    -- Controlled Notification Types Constraint
    CONSTRAINT chk_notification_type CHECK (
        notification_type IN (
            'COMPLAINT_SUBMITTED',
            'CATEGORY_UPDATED',
            'ROUTING_COMPLETED',
            'HUMAN_REVIEW_REQUIRED',
            'STATUS_CHANGED',
            'SLA_WARNING',
            'SLA_BREACHED',
            'CASE_RESOLVED',
            'CASE_CLOSED'
        )
    )
);

--------------------------------------------------------------------------------
-- 2. Indexes for Query Performance & Idempotency
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_complaint_id 
    ON citizen_notifications(complaint_id);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
    ON citizen_notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
    ON citizen_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_complaint_created 
    ON citizen_notifications(complaint_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency 
    ON citizen_notifications(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;
