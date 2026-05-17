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

-- 2. PIN hashes (jediný riadok)
CREATE TABLE IF NOT EXISTS pins (
    id INTEGER PRIMARY KEY DEFAULT 1,
    admin_pin TEXT DEFAULT '',
    heir_pins JSONB DEFAULT '["","","",""]'::jsonb,
    auth_version INTEGER DEFAULT 2,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vložíme prázdny riadok pre app_data
INSERT INTO app_data (id, data)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Vložíme prázdny riadok pre pins
INSERT INTO pins (id, admin_pin, heir_pins, auth_version)
VALUES (1, '', '["","","",""]'::jsonb, 2)
ON CONFLICT (id) DO NOTHING;

-- Vypneme Row Level Security (pre rodinnú aplikáciu postačuje)
ALTER TABLE app_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE pins DISABLE ROW LEVEL SECURITY;
