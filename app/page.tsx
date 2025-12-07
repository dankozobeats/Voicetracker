import { redirect } from 'next/navigation'

/**
 * Redirect root path to the main dashboard.
 */
export default function HomeRedirect() {
  redirect('/dashboard')
}
