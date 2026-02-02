import { createClient } from '@supabase/supabase-js'

// These are public keys - safe to expose in client-side code
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const STORAGE_BUCKET = 'corpus-texts'

/**
 * Get the public URL for a document stored in Supabase Storage
 */
export function getDocumentStorageUrl(filename: string): string {
  if (!supabaseUrl) {
    console.warn('Supabase URL not configured')
    return ''
  }
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`
}

/**
 * Fetch document text from Supabase Storage
 */
export async function fetchDocumentText(filename: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(filename)

    if (error) {
      console.error('Error fetching document:', error)
      return null
    }

    return await data.text()
  } catch (error) {
    console.error('Error fetching document text:', error)
    return null
  }
}
