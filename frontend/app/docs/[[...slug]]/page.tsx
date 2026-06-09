import { source } from '@/lib/source'
import { PageRoot, PageArticle } from 'fumadocs-ui/layouts/docs/page'
import { notFound } from 'next/navigation'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { Metadata } from 'next'

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  const page = source.getPage(params.slug)

  if (!page) {
    notFound()
  }

  const MDX = page.data.body

  return (
    <PageRoot toc={{ toc: page.data.toc }}>
      <PageArticle>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">{page.data.title}</h1>
        {page.data.description && (
          <p className="text-muted-foreground mb-8">{page.data.description}</p>
        )}
        <MDX components={{ ...defaultMdxComponents }} />
      </PageArticle>
    </PageRoot>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)

  if (!page) {
    return {}
  }

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
