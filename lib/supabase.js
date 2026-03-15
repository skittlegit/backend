import { createClient } from '@supabase/supabase-js';
import getConfig from '@/lib/config';

let _supabase = null;

export default function getSupabase() {
  if (_supabase) return _supabase;
  const config = getConfig();
  _supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  return _supabase;
}
