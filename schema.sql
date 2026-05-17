-- ==============================
-- Dedičské konanie – Supabase Schema
-- ==============================
-- Spustite tento SQL v Supabase SQL Editore (Dashboard > SQL Editor)
-- po vytvorení nového projektu na https://supabase.com

-- 1. App Data (jediný riadok s celým stavom aplikácie)
CREATE TABLE IF NOT EXISTS app_data (
    id INTEGER PRIMARY KEY DEFAULT 1,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Email users / roles mapping
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'heir')),
    participant_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT app_users_participant_check
        CHECK (
            (role = 'admin' AND participant_id IS NULL) OR
            (role = 'heir' AND participant_id BETWEEN 0 AND 3)
        )
);

-- Vložíme prázdny riadok pre app_data
INSERT INTO app_data (id, data)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Vypneme Row Level Security (pre rodinnú aplikáciu postačuje)
ALTER TABLE app_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;

-- 4. One-time email OTP codes (backend-managed)
CREATE TABLE IF NOT EXISTS email_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email_created_at
ON email_otps (email, created_at DESC);

ALTER TABLE email_otps DISABLE ROW LEVEL SECURITY;

-- 5. Admin access audit + simple rate-limit support
CREATE TABLE IF NOT EXISTS admin_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_email TEXT,
    actor_role TEXT,
    actor_ip_hash TEXT,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_audit_action_ip_created
ON admin_access_audit (action, actor_ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_access_audit_created
ON admin_access_audit (created_at DESC);

ALTER TABLE admin_access_audit DISABLE ROW LEVEL SECURITY;
