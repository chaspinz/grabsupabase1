import { createClient } from '@supabase/supabase-js'

// ╔══════════════════════════════════════════════════════════════╗
// ║  GANTI 2 BARIS INI DENGAN KREDENSIAL SUPABASE ANDA          ║
// ║  Ambil dari: supabase.com → Project Settings → API          ║
// ╚══════════════════════════════════════════════════════════════╝
const SUPABASE_URL = 'https://mzxjpjgpvznpbbsmnmjj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eGpwamdwdnpucGJic21ubWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDUzMzEsImV4cCI6MjA5NjgyMTMzMX0.PM6XuOJ1mwHtFx98JsgkPAroK1Rfhdn6sh_gi3v3L_s'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
