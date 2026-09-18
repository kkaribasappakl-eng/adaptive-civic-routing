-- Migration: 009_human_review.sql
-- Description: Human-in-the-loop review workflow, operator decisions, and review audit trail
-- Stage: Stage 9 — Operator Review & Human-in-the-Loop Workflow

--------------------------------------------------------------------------------
-- 1. Create Complaint Reviews Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    review_status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    reason TEXT NOT NULL,
    reviewer_name VARCHAR(150),
    selected_authority_id UUID NULL REFERENCES authorities(id) ON DELETE SET NULL,
    selected_department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
    selected_jurisdiction_version_id UUID NULL REFERENCES jurisdiction_versions(id) ON DELETE RESTRICT,
    reviewer_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE NULL,

    -- Controlled Review Status Constraint
    CONSTRAINT chk_review_status CHECK (
        review_status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED')
    )
);

--------------------------------------------------------------------------------
-- 2. Create Complaint Review Actions Table (Append-Only Audit Trail)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_review_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES complaint_reviews(id) ON DELETE CASCADE,
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    actor_name VARCHAR(150) NOT NULL,
    previous_routing_status VARCHAR(30),
    new_routing_status VARCHAR(30),
    previous_complaint_status VARCHAR(30),
    new_complaint_status VARCHAR(30),
    authority_id UUID NULL REFERENCES authorities(id) ON DELETE SET NULL,
    department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
    jurisdiction_version_id UUID NULL REFERENCES jurisdiction_versions(id) ON DELETE SET NULL,
    note TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Controlled Action Types Constraint
    CONSTRAINT chk_review_action_type CHECK (
        action_type IN (
            'REVIEW_STARTED',
            'ROUTE_TO_AUTHORITY',
            'RETURN_TO_TRIAGE',
            'MARK_UNROUTABLE',
            'CLOSE_REVIEW'
        )
    )
);

--------------------------------------------------------------------------------
-- 3. Indexes for Query Performance & Uniqueness/Idempotency
--------------------------------------------------------------------------------
-- Ensure at most ONE active review (OPEN or IN_REVIEW) per complaint
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_complaint_review 
    ON complaint_reviews(complaint_id) 
    WHERE review_status IN ('OPEN', 'IN_REVIEW');

CREATE INDEX IF NOT EXISTS idx_complaint_reviews_complaint_id 
    ON complaint_reviews(complaint_id);

CREATE INDEX IF NOT EXISTS idx_complaint_reviews_status 
    ON complaint_reviews(review_status);

CREATE INDEX IF NOT EXISTS idx_complaint_reviews_created_at 
    ON complaint_reviews(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_actions_review_id 
    ON complaint_review_actions(review_id);

CREATE INDEX IF NOT EXISTS idx_review_actions_complaint_id 
    ON complaint_review_actions(complaint_id);

CREATE INDEX IF NOT EXISTS idx_review_actions_created_at 
    ON complaint_review_actions(created_at DESC);
