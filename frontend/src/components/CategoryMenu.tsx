'use client';

import { useState } from 'react';
import Link from '@/components/TenantLink';
import type { CategoryTreeEntry } from '@/domain/catalog/types';

function hrefFor(id: string) {
  return `/catalogo?classificacao=${encodeURIComponent(id)}`;
}

function TreeLinks({ nodes, depth = 0 }: { nodes: CategoryTreeEntry[]; depth?: number }) {
  return <div className={depth ? 'ml-3 border-l border-border pl-2' : ''}>{nodes.map((node) => <div key={node.id}>
    <Link href={hrefFor(node.id)} className="block rounded-md px-3 py-2 text-[13px] whitespace-nowrap text-brand-text hover:bg-brand-background hover:text-brand-primary">{node.name}</Link>
    {node.children.length > 0 && <TreeLinks nodes={node.children} depth={depth + 1} />}
  </div>)}</div>;
}

export default function CategoryMenu({ categoryTree }: { categoryTree: CategoryTreeEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!categoryTree.length) return null;
  return <nav className="flex flex-wrap gap-2.5 border-b border-[#eee] bg-white px-4 py-3.5">
    {categoryTree.map((node) => node.children.length === 0 ? <Link key={node.id} href={hrefFor(node.id)} className="cursor-pointer rounded-full border border-[#ddd] bg-white px-3.5 py-1.5 text-[13px] whitespace-nowrap text-brand-text hover:border-brand-primary hover:text-brand-primary">{node.name}</Link> : <div key={node.id} className="relative">
      <button type="button" className="cursor-pointer rounded-full border border-[#ddd] bg-white px-3.5 py-1.5 text-[13px] whitespace-nowrap text-brand-text hover:border-brand-primary hover:text-brand-primary" onClick={() => setOpenId((current) => current === node.id ? null : node.id)}>{node.name}</button>
      {openId === node.id && <div className="absolute top-[calc(100%+6px)] z-20 min-w-[200px] rounded-lg bg-white p-1.5 text-left shadow-[0_6px_20px_rgba(0,0,0,0.15)]"><Link href={hrefFor(node.id)} className="mb-1 block border-b border-[#eee] px-3 py-2.5 text-[13px] font-semibold">Ver tudo em {node.name}</Link><TreeLinks nodes={node.children} /></div>}
    </div>)}
  </nav>;
}
