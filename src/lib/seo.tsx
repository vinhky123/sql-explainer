import { useEffect, type ReactNode } from 'react'

interface SeoOptions {
  title: string
  description: string
  jsonLd?: object | object[]
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

const JSONLD_ID = 'seo-jsonld'

export function useSeo({ title, description, jsonLd }: SeoOptions) {
  useEffect(() => {
    document.title = title
    setMeta('description', description)
    setMeta('og:title', title, 'property')
    setMeta('og:description', description, 'property')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)

    const existing = document.getElementById(JSONLD_ID)
    if (existing) existing.remove()
    if (jsonLd) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.id = JSONLD_ID
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
    return () => {
      const el = document.getElementById(JSONLD_ID)
      if (el) el.remove()
    }
  }, [title, description, jsonLd])
}

export function SrOnlyH1({ children }: { children: ReactNode }) {
  return <h1 className="sr-only">{children}</h1>
}
