'use client';

import NextLink, { type LinkProps } from 'next/link';
import type { ComponentProps } from 'react';
import { useTenant } from './TenantProvider';

type TenantLinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & Pick<LinkProps, 'href'>;

export default function TenantLink({ href, ...props }: TenantLinkProps) {
  const { href: tenantHref } = useTenant();
  return <NextLink href={typeof href === 'string' ? tenantHref(href) : href} {...props} />;
}
