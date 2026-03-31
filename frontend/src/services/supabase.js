import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials not found. Using fallback mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Support ticket functions
export const submitSupportTicket = async (name, email, message) => {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert([{ name, email, message, status: 'open' }])
    .select();
  
  if (error) throw error;
  return data[0];
};

export const getSupportTickets = async () => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

// Vlog functions
export const getVlogs = async () => {
  const { data, error } = await supabase
    .from('vlog_entries')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

export const createVlog = async (title, video_url, thumbnail) => {
  const { data, error } = await supabase
    .from('vlog_entries')
    .insert([{ title, video_url, thumbnail }])
    .select();
  
  if (error) throw error;
  return data[0];
};