'use client'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton(){const [loading,setLoading]=useState(false);const router=useRouter();return <button className="nav-signout" disabled={loading} onClick={async()=>{setLoading(true);await createClient().auth.signOut();router.replace('/login');router.refresh()}}><LogOut size={17}/>{loading?'Signing out…':'Sign out'}</button>}
