/**
 * Dedičské konanie – Supabase Module
 *
 * Inicializácia Supabase klienta.
 * Konfigurácia sa načíta z config.js.
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
const isSupabaseDisabled = () => !!globalThis.__DISABLE_SUPABASE__;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: !isSupabaseDisabled(),
        autoRefreshToken: !isSupabaseDisabled(),
    },
});
