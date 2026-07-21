'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function resendVerificationEmail(
  email: string,
): Promise<{ ok: boolean; message: string }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, message: 'Server configuration error.' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate')) {
      return {
        ok: false,
        message: 'Please wait before requesting another email.',
      };
    }
    if (msg.includes('not found') || msg.includes('user')) {
      return { ok: false, message: 'No account found with this email.' };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath('/verify-email');
  return { ok: true, message: 'Verification email sent. Check your inbox.' };
}
