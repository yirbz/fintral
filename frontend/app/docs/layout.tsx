import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { source } from '@/lib/source'
import { RootProvider } from 'fumadocs-ui/provider'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout
        nav={{
          title: 'Fintral Docs',
        }}
        sidebar={{
          enabled: true,
        }}
        tree={source.getPageTree() as any}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
