import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const errorParam = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  const code = url.searchParams.get('code');

  if (errorParam) {
    return NextResponse.redirect(
      new URL(
        `/login?error=verification-failed&message=${encodeURIComponent(
          errorDescription ?? errorParam,
        )}`,
        req.url,
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=verification-failed', req.url),
    );
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(
      new URL('/login?error=verification-failed', req.url),
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expired')) {
      return NextResponse.redirect(
        new URL('/login?error=verification-expired', req.url),
      );
    }
    return NextResponse.redirect(
      new URL('/login?error=verification-failed', req.url),
    );
  }

  return NextResponse.redirect(new URL('/', req.url));
}
