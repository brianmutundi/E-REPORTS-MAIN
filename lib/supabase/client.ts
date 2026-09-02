import { createBrowserClient } from '@supabase/ssr'

export function createClient(persist: boolean = true) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage:
          typeof window !== 'undefined'
            ? persist
              ? window.localStorage
              : window.sessionStorage
            : undefined,
      },
    }
  )
}
